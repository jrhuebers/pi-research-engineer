---
name: figure-quality
description: Validate and visually inspect scientific figures generated from computational results. Use whenever plotting experiment outputs, comparing methods, or embedding figures in reports.
---

# Figure quality

A plotting command succeeding does not establish that its figure is correct.

## Before plotting

Record the data contract:

- meaning of every array axis;
- statistic being plotted (mean, median, ratio, error, etc.);
- replicate and uncertainty aggregation;
- whether methods are progressive or fixed-budget;
- units, scales, and reference values.

Do not use a convenient reduction without checking it against the experiment
driver and metadata.

## Numerical checks

Check the data used by each figure:

```python
assert np.isfinite(values).all()
assert np.all(np.diff(sample_sizes) > 0)
```

For log axes, all plotted values must be positive. Handle zeros and negative
confidence-band bounds deliberately; do not replace them with machine-tiny
values that can distort the axis.

For ratios, explicitly choose ratio-of-means versus mean-of-ratios and define a
zero-denominator policy.

## Visual QA gate

After generating each meaningful figure, open it with the image-reading tool.
For PDF output, render a diagnostic PNG or inspect the compiled PDF.

Check:

- limits, ticks, scales, and units;
- labels, legend, and method/color consistency;
- uncertainty bands and error bars;
- clipping, overlap, whitespace, and readability;
- NaN/Inf/extreme values;
- agreement with direct numerical summaries.

Never summarize or publish a figure before this inspection.

## Report synchronization gate

When figures are part of a report:

1. validate source artifacts;
2. regenerate figures and tables;
3. visually inspect them;
4. recompile the report;
5. inspect the compiled PDF and warnings.

This prevents a current `.tex` file from being paired with stale or broken
figures. Record the command, Git revision, input artifacts, configuration, and
output paths.
