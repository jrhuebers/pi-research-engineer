# pi-research-engineer

A private, isolated Pi environment for computational research and engineering.
It is designed for one interactive agent per project: durable local processes,
Slurm submission, tmux log viewers, and a reproducible agent profile without
altering ordinary `pi`.

## Quick start

```bash
git clone git@github.com:jrhuebers/pi-research-engineer.git
cd pi-research-engineer
make setup

# In the project you want to work on:
cd /path/to/project
pre
```

`pre` is a short alias for `pi-research-engineer`.

The first run uses an isolated Pi profile, so authenticate providers inside
that session as needed (for example with Pi's `/login`).

## What `pre` is

`pre` starts Pi inside a dedicated tmux session using:

- a package-local Pi executable;
- this repository's extensions and skills;
- the bundled, version-pinned tmux binary and a package-local tmux socket;
- an isolated Pi profile at `<this-repo>/.pi/agent/`.

The default tmux session is deterministic for the canonical working directory.
Launching `pre` again from the same directory reattaches to that directory's
session; launching it from another directory creates a different session.

This is intentionally separate from ordinary `pi`:

- `make setup` does **not** run `pi install`;
- it does not modify `~/.pi/agent`;
- ordinary `pi` does not load this repository's extensions or skills;
- `npm link` only makes the `pre` and `pi-research-engineer` launcher commands
  available on `PATH`.

Use ordinary `pi` when you want ordinary Pi. Use `pre` when you want this
isolated research environment.

## Tmux workflow

The main tmux window is named `agent` and contains Pi. Local background jobs and Slurm jobs receive
separate viewer windows that follow their authoritative logs. Viewer windows
close when the underlying work reaches a terminal state; closing a viewer does
not cancel its work.

From inside Pi, use the `/detach` command to detach this terminal while
leaving Pi and all jobs running. The equivalent nested-tmux key sequence is:

```text
Ctrl+B  Ctrl+B  D
```

To create the session without attaching:

```bash
pre --detached
```

Useful overrides:

```bash
PI_RESEARCH_TMUX_SESSION=my-session pre
PI_RESEARCH_TMUX_TMPDIR=/path/to/private-tmux-runtime pre
PI_RESEARCH_AGENT_DIR=/path/to/isolated-profile pre
PI_RESEARCH_SLURM_LOG_DIR=/shared/log/root pre
```

## Local background work

The `bash` tool manages long-lived local work. It has this interface:

```ts
bash({
  command: string,
  description?: string,
  run_in_background?: boolean,       // default false
  background_after_seconds?: number, // default from config.yaml
  max_run_seconds?: number,          // unlimited if omitted
  notify_on_exit?: boolean,          // default true
})
```

Examples:

```ts
// Start a known long-running process immediately.
bash({
  command: "python -u train.py --config configs/base.yaml",
  description: "train base model",
  run_in_background: true,
  max_run_seconds: 14400,
})

// Run normally, but move it to the background after five seconds.
bash({
  command: "pytest -q",
  description: "test suite",
  background_after_seconds: 5,
})
```

Background jobs run in their own process group. They write logs below:

```text
<project>/.pi-background-tasks/<session-token>/
```

By default, the agent receives one completion notification containing status,
duration, exit code, log path, and a bounded log tail. In `pre`, a tmux viewer
opens when the job is created.

Inspect or control active jobs with:

```ts
jobs({ action: "list" })
jobs({ action: "kill", job_id: "job-1" })
jobs({ action: "extend", job_id: "job-1", max_run_seconds: 7200 })
```

`extend` sets a new **total** runtime limit measured from process creation. The
operator-facing `/jobs` command shows the same active-job list without
involving the model.

The default foreground-to-background delay is configured in:

```text
background-tasks/config.yaml
```

On an explicit Pi quit, managed local process groups receive `SIGTERM`. Use
Slurm for work that must outlive the interactive Pi process.

## Slurm

The local-cluster Slurm tools are:

```ts
slurm_submit(command, partition?, gpus?, cpus?, mem?, name?, notify_after_minutes?)
slurm_jobs(show_all?, include_completed?)
slurm_cancel(job_id, reason)
```

`slurm_submit` determines the selected partition's finite `MaxTime` and
requests that walltime automatically. It tracks submitted jobs in the Pi
session and sends start, completion, and optional elapsed-time notifications.

Slurm logs default to:

```text
<project>/.pi-research-engineer/slurm/
```

Use a shared override when required by the cluster:

```bash
PI_RESEARCH_SLURM_LOG_DIR=/shared/project/logs pre
```

Slurm allocations are owned by Slurm, not by tmux or Pi. A tmux viewer is only
a log display. Do not use tmux to cancel an allocation; use `slurm_cancel`.

Only the local Slurm installation is supported today. Remote-cluster design
constraints—especially immutable source staging—are documented in
[`docs/remote-slurm.md`](docs/remote-slurm.md). Remote submission is not yet
implemented.

## Transcript timing

The transcript includes durable UTC markers:

- a timestamp after each user message;
- one elapsed-duration marker when Pi finishes all automatic work and control
  returns to the human.

`Z` in a timestamp denotes UTC (Zulu time).

## Sessions

Pi sessions auto-save under the isolated profile:

```text
<this-repo>/.pi/agent/sessions/
```

Inside Pi, use `/session` to inspect the current session and `/resume` to pick
an earlier one. At a fresh launcher start, `pre -c` continues the most recent
session and `pre -r` opens the session picker.

Detaching tmux keeps Pi and its session running. `/quit` exits Pi cleanly and
preserves the session transcript.

## Repository layout

```text
background-tasks/     Standalone local background-task extension and YAML config
bin/                  pre / pi-research-engineer launcher
extensions/           Research guidance, Slurm, tmux viewers, timing, policies
skills/               On-demand computational-research and operations guidance
docs/                 Design notes
.tmux.conf            Managed tmux appearance and behavior
Makefile              Setup and validation targets
```

The background-task extension is deliberately self-contained so it can later be
moved into another Pi package without bringing along the Slurm or tmux code.

## Development

```bash
make setup            # npm install + npm link + local Git hooks
make check            # TypeScript type-check
make prompt-snapshot  # regenerate PRE_SYSTEM_PROMPT.md
```

`PRE_SYSTEM_PROMPT.md` is a checked-in, provider-independent baseline of
Pre's assembled prompt and active tool definitions. The pre-commit hook
regenerates it; CI rejects a push or pull request when it is stale. It cannot
include provider-side hidden instructions or dynamic project/session context.

After editing an extension in a running `pre` session, run:

```text
/reload
```

Package and launcher changes generally require running `make setup` again.

## Safety model

This package executes commands and can submit cluster jobs with your Unix
account. Treat agent actions as normal shell and scheduler actions:

- inspect code, configuration, data assumptions, logs, and artifacts before
  accepting a research result;
- use tracked background jobs for local long-running work;
- use Slurm for durable cluster work;
- do not consider submission or process launch a successful computation;
- inspect terminal status, logs, and artifacts before reporting completion.
