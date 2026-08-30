# Local Sway workspace

## Purpose

This optional component provides a native local GUI workspace for an agent that
runs on a remote cluster. It is **not** a remote desktop and does not use
screenshots or vision. The agent receives a small structured API; the local
user sees normal editor, terminal, PDF, and file-browser windows.

```text
remote cluster                         laptop / desktop
--------------                         ----------------
Pre agent ─ SSH Unix-socket forward ─> Linux VM in a normal host window
  workspace tool                         Sway → pre-workspace → local apps
  JSON state only                        editor / foot / zathura
```

The VM is the strongest security boundary. Run Sway as the desktop session
**inside a small Linux VM** (for example UTM on macOS, or QEMU/KVM on Linux),
rather than on the host desktop. Its graphical output is then just one ordinary
host window. The controller is bound to that VM's `SWAYSOCK`, so it cannot
reach the host GNOME/macOS/Windows window manager.

For a fast UI-only trial on a Wayland Fedora host, a nested Sway process can
also run directly in one host window. It isolates window-manager control but
not local processes; use the VM when remote terminal commands must have a hard
OS boundary.

## Fast Fedora nested-Sway trial

Install the local applications on the Fedora host:

```bash
sudo dnf install sway foot zathura geany git nodejs openssh-clients fuse-sshfs
```

Run this from a **normal host terminal**, not from within Sway:

```bash
cd /path/to/pi-research-engineer
pre-workspace-nested-sway \
  --workspace pre-agent \
  --allow-root "$HOME" \
  --editor geany \
  --terminal foot \
  --pdf-viewer zathura
```

The launcher opens a nested Sway window and automatically starts the
controller with that nested compositor's environment. This avoids having to
paste any setup commands into the nested session; nested Wayland compositors
do not necessarily share the host clipboard. `Super+Enter` opens `foot` and
`Super+Shift+E` exits the nested session. Continue with the SSH forwarding
section below from another normal host terminal.

## Controller API

`pre-workspace` is a local, newline-delimited JSON server over a Unix socket.
The socket is mode `0600`; it never listens on TCP. Each request has one
`method`, and each response is either `{ "ok": true, "result": ... }` or
`{ "ok": false, "error": ... }`.

| Method | Parameters | Effect |
| --- | --- | --- |
| `state` | none | managed-workspace layout and window list as JSON |
| `workspace` | none | focus/create the configured workspace |
| `focus` | `id` | focus a container already in that workspace |
| `split` | `direction`, optional `id` | split horizontally or vertically |
| `open_file` | `path` | launch the configured editor for an allowed file |
| `open_pdf` | `path` | launch the configured PDF viewer for an allowed file |
| `open_terminal` | optional `argv`, `title` | launch the configured terminal; argv is not shell-parsed |

There is intentionally no raw `swaymsg`, no arbitrary criteria, no screenshot
endpoint, and no API for windows outside the configured workspace. `state`
filters Sway's tree to that workspace before returning it.

## VM setup

1. Create a minimal Linux VM. On macOS, UTM is a suitable host application:
   its VM display remains an ordinary macOS window and VirtioFS can expose a
   project directory into the guest. On Linux use QEMU/KVM or an equivalent
   VM. Do not expose a host `SWAYSOCK` to this controller.
2. In the guest install Sway plus the local apps, for example on Debian/Ubuntu:

   ```bash
   sudo apt install sway foot zathura
   # Install your preferred editor separately, e.g. VS Code or VSCodium.
   ```

3. Start a Sway session in the VM and mount or synchronize project data at a
   stable path such as `/workspace`. Use VirtioFS, SSHFS, rsync, or Git; the
   controller does no file streaming.
4. In a terminal **inside that Sway session**, launch the controller. Restrict
   it to the mounted project root:

   ```bash
   pre-workspace \
     --socket "$XDG_RUNTIME_DIR/pre-workspace.sock" \
     --workspace pre-agent \
     --allow-root /workspace \
     --editor code \
     --terminal foot \
     --pdf-viewer zathura
   ```

   It prints one JSON `ready` record. Keep it running with a user systemd
   service or the VM's session supervisor. The CLI fails fast unless
   `SWAYSOCK` exists and answers `get_tree`.

5. Optionally set Sway to open the usual local applications with mouse support.
   Sway itself supplies mouse handling; the controller only sends IPC commands.
   Keep normal user keybindings and configure an obvious workspace name such as
   `pre-agent`.

## Forwarding capability to the remote agent

Make the local socket available to **only the same SSH account on the cluster**
with a reverse Unix-socket forward, launched from the VM:

```bash
ssh -NT \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -R /tmp/pre-workspace-${USER}.sock:"$XDG_RUNTIME_DIR/pre-workspace.sock" \
  huebers@cluster.example.edu
```

The remote path is an SSH-created Unix socket, not a network port. Its owner
can invoke the local controller; SSH encryption and account permissions are
the authorization boundary. Remove the remote socket or stop this SSH process
to revoke the capability immediately.

On the cluster, start Pre with that path present in its environment:

```bash
export PRE_WORKSPACE_SOCKET=/tmp/pre-workspace-${USER}.sock
cd /path/to/project
pre
```

When that variable is absent, the `workspace` tool is not registered at all.
When it is present, the remote Pre agent receives this narrow tool API:

```ts
workspace({ action: "state" })
workspace({ action: "open_pdf", path: "/workspace/project/report/build/report.pdf" })
workspace({ action: "split", direction: "vertical" })
workspace({ action: "open_terminal", title: "Slurm log", argv: ["tail", "-f", "run.log"] })
```

Paths are interpreted **inside the VM** and must be below an `--allow-root`.
Therefore use a stable VM project mount path and tell the agent that path. A
remote path need not equal the local VM mount path.

## Operational and security notes

- The remote agent continues to compute, submit Slurm jobs, and use Git on the
  cluster. The VM only renders local project artifacts and terminals.
- A local terminal can run any command supplied in `argv`, but it runs inside
  the VM's isolated Sway session, never on the host desktop. There is no shell
  parsing by the controller.
- The controller's `focus` and `split` verify target container IDs against the
  managed workspace immediately before issuing a command.
- Start one controller per isolated Sway instance. Do not point it at your
  everyday host Sway socket.
- The API socket and SSH forward are intentionally ephemeral runtime state;
  do not commit them or expose them through a public TCP listener.

## Verification

From the package checkout:

```bash
npm run test:workspace
```

The test uses a mock Sway IPC command to verify JSON state filtering,
workspace-container authorization, path restrictions, and safe terminal argv
handling without requiring a display server.
