---
name: tmux-operations
description: Safely inspect and clean up Pi research tmux windows while keeping the main Pi session and active job viewers. Use when opening, watching, closing, or diagnosing tmux windows associated with local or Slurm work.
---

# Tmux Operations

## Authority model

Tmux is a **viewing surface**, not a process manager:

- Slurm owns Slurm jobs.
- The background-job system owns local background processes.
- Tmux windows only display logs or interactive Pi state.
- Killing a viewer window must never be treated as cancelling the underlying job.

Always reconcile viewer windows with the authoritative process/job state before
closing them.

## Use the configured Pi tmux server

Do not invoke the default `tmux` binary or create a new session unless the user
explicitly asks. Pi may use a private tmux binary, socket, and session. Use the
configured environment variables:

```bash
TMUX_BIN="$PI_RESEARCH_TMUX_BIN"
TMUX_SOCKET="$PI_RESEARCH_TMUX_SOCKET"
TMUX_SESSION="$PI_RESEARCH_TMUX_SESSION"

"$TMUX_BIN" -L "$TMUX_SOCKET" \
  list-windows -t "$TMUX_SESSION" \
  -F '#{window_index}|#{window_name}|#{window_active}|#{pane_current_command}'
```

If this reports `server exited unexpectedly`, first check that the configured
binary, socket, and session variables are being used. Do not silently switch to
the system tmux server.

## Safe inspection workflow

1. List windows using the configured binary and socket.
2. Classify windows by name:
   - `pi`: preserve the main Pi window.
   - `slurm-<jobid>`: viewer for a Slurm job.
   - `local-<id>`: viewer for a local background job.
3. Query the authoritative state:
   - Slurm: use `slurm_jobs` or `squeue`/`sacct` for a concrete diagnostic.
   - Local jobs: use the background-job tool (`jobs`), not tmux pane state.
4. Preserve viewers for jobs in `PENDING`, `RUNNING`, or another nonterminal
   state.
5. Close viewers only for jobs confirmed `COMPLETED`, `FAILED`, `CANCELLED`,
   `TIMEOUT`, or otherwise terminal.
6. List windows again and report exactly what was preserved and closed.

## Closing a viewer

Use the configured server and target the window by name:

```bash
"$TMUX_BIN" -L "$TMUX_SOCKET" \
  kill-window -t "$TMUX_SESSION:slurm-12345"
```

This closes only the viewer. For an actual Slurm cancellation, use the Slurm
cancellation tool and provide a reason. Never cancel a job merely because its
viewer is inconvenient or because it is taking a long time.

## Stale viewers and notifications

A viewer may outlive a job briefly, and a delayed reminder may refer to a job
that has already become terminal. Treat the job ID as authoritative. Verify it
before inspecting or closing anything. Do not infer job state from whether a
viewer window exists.

A viewer may display `[waiting for log...]` while the Slurm output file has not
yet been created. This is normal submission/allocation startup behavior and is
not evidence that the computation is stalled.

## User requests to clean up windows

For “close inactive/other windows”:

- Preserve the main `pi` window.
- Preserve viewers for genuinely active runs.
- Close only viewers whose authoritative jobs are terminal.
- If a job's state is unknown, inspect it before closing the viewer.
- Do not close a viewer merely because it is not the currently selected window.
