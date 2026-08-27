# pi-research-engineer

Personal Pi package for ML and computational research engineering. It is a
single-agent setup: no research-team daemon, agent communication, required
experiment layout, W&B integration, or project-specific provenance system.

## Included

- `pi-patty-bg-tasks`, with a 30-second foreground-to-background default;
- `pi-web-access` for web, paper, and documentation lookup;
- always-on research-engineering guidance;
- `slurm_submit`, `slurm_jobs`, and `slurm_cancel` tools;
- pickup, terminal-state, and optional timed-reminder notifications for Slurm
  jobs submitted through `slurm_submit`;
- on-demand skills for computational-research work and Slurm operations.

Patty's event-streaming `monitor` tool is deliberately disabled: it can inject
every matching log line into the agent context. `bash_bg` is disabled too;
use `bash(run_in_background=true, description="…")` for named background
jobs. `agent_bg` is disabled because its short, lossy context handoff is not a
reliable basis for computational research work. Ordinary tracked background
jobs still send one completion notification. `job_decide` is disabled as an
unnecessary timeout-acknowledgement path; use `jobs` only when a concrete
inspection or cancellation is needed.

The web profile keeps ordinary search and page retrieval, but disables the
opinionated `source_check` claim-verdict workflow.

## tmux mode

Use `pi-research` instead of `pi` when you want a dedicated tmux session for
the current project. It uses the repository's `.tmux.conf` and creates the
standard `pi-research` session with a `pi` window and sibling viewer windows
for every local background job and Slurm job started from that session. Viewer
windows follow the authoritative log and remain visible after a terminal state.
They do not run or manage the work itself: Patty still owns local child
processes and Slurm still owns allocations.

`Ctrl+C` is ignored inside a viewer window, so it cannot interrupt the log
viewer or the underlying job.

```bash
pi-research
```

Inside an existing tmux client, `pi-research` switches that client to the
project session rather than nesting tmux. Use tmux's session chooser to return.
For scripts or setup checks, `pi-research --detached` creates the session
without attaching.
Slurm output defaults to `<project>/.pi-research-engineer/slurm/`, so it is
visible both to the submit host and compute node when the project is on shared
storage. Set `PI_RESEARCH_SLURM_LOG_DIR` to use a different shared log root.

Submitted jobs are stored in the Pi session, so reopening that session resumes
their monitoring. A fresh Pi session can still inspect account jobs with
`slurm_jobs(show_all=true)`.

## Install

From this repository:

```bash
npm install
npx pi install /Users/jhuebers/projects/pi-research-engineer
npm link
```

This registers the package in Pi's global settings. Thereafter start ordinary
Pi with `pi`; its extensions and skills are loaded automatically. Pin package
versions in `package.json`, not with separate global installs.

`npm link` installs the optional global `pi-research` wrapper used for tmux
mode. It does not replace the regular `pi` command.

For development, edit an extension and use `/reload` in a running Pi session.

## Slurm policy

`slurm_submit` resolves a selected partition's `MaxTime` and requests that
maximum. It intentionally has no walltime parameter. Specify a partition when
the cluster does not have exactly one default partition.
