---
name: tmux-operations
description: Safely inspect and manage tmux sessions and windows without confusing viewer panes with the processes they display. Use when opening, watching, or closing tmux windows.
---

# Tmux operations

Treat tmux as a terminal/viewing surface, not as the owner of long-running
processes. Closing a window closes its pane; it does not necessarily stop the
process running in it.

Before changing anything:

1. Identify the intended tmux server, socket, and session.
2. List windows and panes with their names and commands.
3. Identify which windows are active, viewers, or interactive work.
4. Check the underlying process or job state before closing a viewer.

When cleaning up:

- preserve the user's active/primary window unless asked otherwise;
- close viewers only when their underlying work is confirmed finished;
- do not cancel or kill work merely to remove a window;
- use the relevant process manager to stop work.

If an application uses a custom tmux socket or binary, use that configuration
rather than silently connecting to the default tmux server. If a viewer says it
is waiting for a log or process, treat that as a display-state message and check
the underlying work separately.
