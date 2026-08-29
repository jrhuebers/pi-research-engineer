---
name: figure-quality
description: Generate, validate, visually inspect, and document scientific figures from computational results. Use whenever plotting experiment outputs, comparing methods, or embedding figures in a report.
---

# Figure Quality

A figure is not complete when the plotting command exits successfully. It is
complete only after the plotted quantity, data aggregation, visual rendering,
and report artifact have all been checked.

## Before plotting

Write down the intended data contract:

- What does each array axis represent?
- Is the plotted value a mean, median, quantile, ratio, or error statistic?
- Is uncertainty computed across independent replicates?
- Are methods evaluated on common graphs, seeds, and sample budgets?
- Are methods progressive, so prefixes are valid, or fixed-budget, requiring a
  separate design at every budget?
- What are the units and reference values?

Do not silently use a convenient array reduction. Confirm the reduction against
the experiment driver and metadata.

## Numerical preflight

Before rendering, check the data used by every figure:

```python
assert np.isfinite(values).all()
assert sample_sizes.ndim == 1
assert np.all(np.diff(sample_sizes) > 0)
```

For logarithmic axes, verify that all plotted values are strictly positive.
Handle zeros and negative lower confidence bounds deliberately; never replace
them with machine tiny values merely to make a log plot render, because that
can distort axis limits by hundreds of orders of magnitude.

For ratios, explicitly choose the estimand. A ratio of per-replicate errors can
be unstable or undefined when the denominator is zero. Consider a ratio of
aggregated means or a documented zero-denominator policy instead. Check the
resulting magnitude before plotting.

## Visual inspection is mandatory

After every meaningful figure-generation run, open the generated image and look
at it. Use the image-reading tool for PNG/JPG output. If the primary output is a
PDF, render a representative page or also save a diagnostic PNG.

Inspect:

- axis limits and tick labels;
- linear/log/symmetric-log scales;
- units, labels, and mathematical notation;
- legends and method-to-color consistency;
- confidence bands and error bars;
- clipping, overlap, unreadable text, and excessive whitespace;
- zero, NaN, Inf, or suspiciously extreme values;
- whether the visual ranking and trends agree with direct numerical summaries;
- color contrast and distinguishability in grayscale where relevant.

A successful plotting process is not evidence that the figure is correct.

## Uncertainty and aggregation

For independent graph replicates, report the aggregation explicitly. For a mean
curve, a conventional confidence band is based on the replicate-level standard
error, but state the convention. Do not call a band a confidence interval if it
is actually a standard deviation or quantile band.

When comparing methods, preserve common-random-number and common-graph details
in metadata. Avoid comparing a mean of ratios to a ratio of means without
saying so.

## Report synchronization gate

A report can contain stale figures even when its LaTeX source is current. Treat
source, figures, tables, and compiled PDF as one build:

1. Validate the source artifacts and record their paths.
2. Regenerate figures and generated tables from those artifacts.
3. Visually inspect the regenerated figures.
4. Compile the report from the regenerated figures.
5. Check compilation warnings and inspect the compiled PDF, especially pages
   containing figures and tables.
6. Record the command, Git revision, data/configuration provenance, and output
   paths.

Do not claim the report is updated until the final PDF has been rebuilt after
the last figure or source change. This is the “report gate”: it is a
consistency/validation gate, not a requirement that every experiment produce a
LaTeX report.

## Minimal final checklist

- [ ] Data axes and aggregation verified.
- [ ] Numeric finiteness and scale-domain checks passed.
- [ ] Figure opened and visually inspected.
- [ ] Labels, legend, units, and uncertainty are correct.
- [ ] Direct summary numbers agree with the plot.
- [ ] Report regenerated and compiled if applicable.
- [ ] Output paths, command, revision, and assumptions recorded.
