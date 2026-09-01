# Adaptive ripgrep tool

Registers the `adaptive_ripgrep` Pi tool. It runs ripgrep with bounded output:

- small searches return detailed matching lines;
- broad or large searches return matching files, occurrence counts, line counts,
  and character counts;
- targeted searches over an explicit list of files remain detailed when they
  fit the output limit.

Thresholds are configured in `config.json`:

```json
{
  "max_detail_characters": 12000,
  "max_detail_lines": 100,
  "max_summary_files": 200
}
```

Character counts are Unicode character counts, not byte counts. Occurrence
counts use ripgrep's non-overlapping match count. Use the tool again with the
selected file paths to retrieve detailed matches after a broad search.
