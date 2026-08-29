---
name: tmux-operations
description: Manage the Pi research engineer's private tmux session and its job-viewer windows. Use when inspecting, opening, watching, or cleaning up that session.
---

# Pi tmux session

This session is a viewing surface:

- Slurm owns Slurm jobs.
- The background-job tool owns local processes.
- Killing a viewer window does not stop its underlying work.

## Use the managed session

Always use Pi's configured binary, socket, and session:

```bash
TMUX_BIN="$PI_RESEARCH_TMUX_BIN"
TMUX_SOCKET="$PI_RESEARCH_TMUX_SOCKET"
TMUX_SESSION="$PI_RESEARCH_TMUX_SESSION"
"$TMUX_BIN" -L "$TMUX_SOCKET" list-windows -t "$TMUX_SESSION" \
  -F '#{window_index}|#{window_name}|#{window_active}|#{pane_current_command}'
```

Do not silently use the default tmux server. A `server exited unexpectedly`
error from plain `tmux` often means the wrong server was contacted.

## Inspect and clean up

1. List the managed windows.
2. Preserve the main `pi` window.
3. Check `slurm-<jobid>` viewers with `slurm_jobs`.
4. Check `local-<id>` viewers with `jobs`.
5. Preserve viewers for active or pending work.
6. Close viewers only after their underlying work is terminal.
7. List windows again and report what changed.

Close a viewer with:

```bash
"$TMUX_BIN" -L "$TMUX_SOCKET" kill-window -t "$TMUX_SESSION:slurm-12345"
```

Use the job/process tools—not tmux—to cancel or kill underlying work. A
`[waiting for log...]` message is normally just a viewer waiting for its output
file; verify the actual job state separately. Delayed notifications can refer
to old job IDs, so verify before acting.
