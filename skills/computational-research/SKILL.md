---
name: computational-research
description: Use for implementing, debugging, evaluating, or interpreting computational research and machine-learning code.
---

# Computational Research Engineering

Before expensive computation, trace the real implementation path: entry point,
resolved configuration, data source and split, preprocessing, model/loss,
metrics, output paths, and random seeds. State what is verified versus what is
only assumed.

Keep reusable functionality in ordinary shared modules. Put thin, task-specific
adapters near the task only when they are truly specific; do not duplicate
training, evaluation, data loading, or metric logic across scripts.

For results, distinguish:

- submission or process start;
- successful program completion;
- validation of produced artifacts and metrics;
- scientific interpretation.

An unexpected outcome calls for code/configuration/data-path checks before a
new scientific conclusion or an unprincipled retry.

For each meaningful run, record the command, Git revision when applicable,
resolved configuration, seeds, environment/resource choices, output locations,
and whether the run was valid, failed, or incomplete.
