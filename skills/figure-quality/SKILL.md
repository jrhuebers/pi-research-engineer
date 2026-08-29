---
name: figure-quality
description: Visually inspect scientific figures after generation and before sharing or publication. Use whenever creating, modifying, or embedding figures.
---

# Figure quality

A plotting command succeeding does not establish that the figure is correct.

## Visual QA gate

After generating every meaningful figure, open the actual rendered output and
inspect it. For PDF output, render a representative page or also save a PNG.
Do not rely on source code, a successful exit status, or a numerical summary.

Check:

- axes, limits, ticks, scales, and units;
- labels, titles, legends, and notation;
- line, marker, color, and panel consistency;
- clipping, overlap, unreadable text, and excessive whitespace;
- error bands, error bars, annotations, and reference lines;
- suspiciously extreme, missing, or flat-looking results;
- whether the figure communicates the intended comparison or trend.

Inspect all panels when practical, and inspect the figure again in its final
embedded context. If anything looks wrong, fix and regenerate it before
summarizing, sharing, or publishing the result.
