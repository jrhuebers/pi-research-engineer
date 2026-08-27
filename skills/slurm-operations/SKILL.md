---
name: slurm-operations
description: Use when submitting, monitoring, diagnosing, or cancelling Slurm jobs for computational research.
---

# Slurm Operations

Use `slurm_submit` for new Slurm work. It tracks the job in this Pi session,
writes a log under `/tmp/pi-research-engineer/slurm/`, requests the selected
partition's maximum walltime, and reports pickup and terminal status.

Before submission, verify the command, working directory, inputs, output path,
resource request, and logging. Long-running programs should write unbuffered,
timestamped, fine-grained progress that includes completed and total work where
known, allowing throughput and ETA to be inferred from logs.

After submission, do not repeatedly call `slurm_jobs`, `squeue`, `sacct`, or
tail logs just to wait. Continue useful work or end the turn; the notification
is the normal completion signal. Inspect status/output when diagnosing a
problem, responding to a notification, or answering a concrete question.

When a job ends, check its state, exit code, log, and intended artifacts before
reporting success. Preserve failed logs. Classify failures as code,
configuration, data, resource, or scheduler/environment issues before retrying.

Use `slurm_cancel` only for obsolete, invalid, or clearly wedged work; a job
being long-running alone is not sufficient reason.
