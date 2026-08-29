# pi-research-engineer

Personal Pi package for ML and computational research engineering. It is a
single-agent setup: no research-team daemon, agent communication, required
experiment layout, W&B integration, or project-specific provenance system.

## Included

- portable `background-tasks` extension: an overridden `bash`, `jobs`, and
  `/jobs`; its foreground-to-background default lives in
  `background-tasks/config.yaml`;
- `pi-web-access` for web, paper, and documentation lookup;
- always-on research-engineering guidance;
- durable UTC timestamps after user messages and one elapsed-duration marker
  when Pi settles and returns control to the human;
- `slurm_submit`, `slurm_jobs`, and `slurm_cancel` tools;
- pickup, terminal-state, and optional timed-reminder notifications for Slurm
  jobs submitted through `slurm_submit`;
- on-demand skills for computational-research work and Slurm operations.

`bash` accepts `run_in_background`, `background_after_seconds`,
`max_run_seconds`, `notify_on_exit`, and an optional description. A process
that is backgrounded is managed as a process group, writes a project-local log
under `.pi-background-tasks/`, and normally sends one completion notification.
`jobs` lists active managed jobs, cancels one by job ID, or extends a finite
maximum runtime. The operator-facing `/jobs` command shows the same list.

The background extension is self-contained in `background-tasks/` and emits
portable lifecycle events. This package's tmux adapter listens to them; tmux
is therefore optional for the transferable extension itself.

The web profile keeps ordinary search and page retrieval, but disables the
opinionated `source_check` claim-verdict workflow.

## tmux mode

Use `pi-research-engineer` instead of `pi` when you want a dedicated tmux session for
the current project. It uses the repository's `.tmux.conf` and a pinned,
platform-specific tmux binary installed with the package. The bundled binary
runs on a dedicated, content-versioned socket, so it never connects to an
ABI-incompatible system-tmux server. It creates one deterministic tmux session
per canonical project directory, named `pre-<directory>-<path-hash>`, with a
`pi` window and sibling viewer windows
for every local background job and Slurm job started from that session. Viewer
windows follow the authoritative log and close automatically when the job reaches
a terminal state. They do not run or manage the work itself: the background-tasks
extension owns local child processes and Slurm owns allocations.

`Ctrl+C` is ignored inside a viewer window, so it cannot interrupt the log
viewer or the underlying job.

```bash
pi-research-engineer
# or: pre
```

Inside an existing tmux window, `pi-research-engineer` (or `pre`) attaches as a nested tmux client;
it does not replace the outer client's session. Re-running it from the same
canonical directory attaches to that directory's existing session; another
directory gets another session. To detach from the inner client, press the tmux
prefix twice (`Ctrl+B`, `Ctrl+B`) and then `D`. For scripts or setup checks,
`pi-research-engineer --detached` creates the session without attaching. Set
`PI_RESEARCH_TMUX_SESSION` to explicitly choose a session name.
Slurm output defaults to `<project>/.pi-research-engineer/slurm/`, so it is
visible both to the submit host and compute node when the project is on shared
storage. Set `PI_RESEARCH_SLURM_LOG_DIR` to use a different shared log root.

Submitted jobs are stored in the Pi session, so reopening that session resumes
their monitoring. A fresh Pi session can still inspect account jobs with
`slurm_jobs(show_all=true)`.

## Install

From this repository:

```bash
make setup
```

`make setup` runs `npm install` and `npm link`. The latter installs the global
`pi-research-engineer` launcher and its short `pre` alias, but does not replace
or configure the regular `pi` command. The wrapper never falls back to the
system tmux; the package must have a bundled binary for the current platform.
Set `PI_RESEARCH_TMUX_SOCKET` only when deliberately choosing a different
dedicated socket shared by the same bundled tmux build.

This setup deliberately does **not** run `pi install` and does not write to
`~/.pi/agent`. Ordinary `pi` therefore cannot load this repository's extensions
or skills. `pi-research-engineer`/`pre` explicitly loads this package and
isolates its settings, authentication, model metadata, sessions, and web cache
under the gitignored `.pi/agent/` in this repository. Authenticate providers
separately in the isolated profile. Set `PI_RESEARCH_AGENT_DIR` to choose
another isolated location.

For development, edit an extension and use `/reload` in a running Pi session.
The background-task default is configured in `background-tasks/config.yaml`.

## Slurm policy

`slurm_submit` resolves a selected partition's `MaxTime` and requests that
maximum. It intentionally has no walltime parameter. Specify a partition when
the cluster does not have exactly one default partition.

The current implementation submits only to the local Slurm installation.
Remote-cluster submission needs explicit source staging and site configuration;
its proposed design and constraints are documented in
[`docs/remote-slurm.md`](docs/remote-slurm.md).
