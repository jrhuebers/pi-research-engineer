---
name: tmux-operations
description: Safely inspect and clean up Pi research tmux viewers while preserving the main Pi window and active job viewers. Use for tmux window operations around local or Slurm work.
---

# Tmux operations

Tmux is a viewing surface, not a process manager:

- Slurm owns Slurm jobs.
- The background-job tool owns local processes.
- Killing a viewer does not cancel its job.

## Use the Pi server

Always use the configured binary, socket, and session; do not use the default
tmux server:

```bash
TMUX_BIN="$PI_RESEARCH_TMUX_BIN"
TMUX_SOCKET="$PI_RESEARCH_TMUX_SOCKET"
TMUX_SESSION="$PI_RESEARCH_TMUX_SESSION"
"$TMUX_BIN" -L "$TMUX_SOCKET" list-windows -t "$TMUX_SESSION" \
  -F '#{window_index}|#{window_name}|#{window_active}|#{pane_current_command}'
```

If the default `tmux` command reports `server exited unexpectedly`, check these
variables and use the configured binary.

## Inspect and clean up

1. List windows with the configured server.
2. Preserve the main `pi` window.
3. For `slurm-<jobid>` viewers, verify state with `slurm_jobs` or Slurm.
4. For `local-<id>` viewers, verify state with `jobs`.
5. Preserve viewers for nonterminal jobs; close viewers only for confirmed
   terminal jobs.
6. List windows again and report what was preserved/closed.

Close a viewer with:

```bash
"$TMUX_BIN" -L "$TMUX_SOCKET" kill-window -t "$TMUX_SESSION:slurm-12345"
```

Do not cancel a job to close its viewer. Use the Slurm cancellation tool only
for obsolete or wedged jobs and provide a reason.

A `[waiting for log...]` message means the viewer started before Slurm created
the output file. It is normally harmless. Delayed reminders can refer to
already-terminal jobs, so always verify the job ID before acting.
