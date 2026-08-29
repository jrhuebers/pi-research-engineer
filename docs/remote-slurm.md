# Remote Slurm: design note (not implemented)

The current Slurm extension runs scheduler commands (`sbatch`, `squeue`,
`sacct`, and `scancel`) on the local host only. Remote-cluster submission is a
future feature, not a supported workflow yet.

## Why SSH submission alone is insufficient

Running `ssh <login-host> sbatch …` only changes where scheduler commands run.
The submitted command also needs its source code, configuration, dependencies,
data paths, and output locations to be valid on the remote site. A remote Git
checkout may be stale, on a different branch, or contain unrelated uncommitted
changes. Blindly submitting from it would produce irreproducible results.

## Proposed direction

Use named, repository-configured clusters rather than allowing models to choose
arbitrary SSH hosts:

```yaml
clusters:
  gpu-remote:
    transport: ssh
    ssh_host: gpu-login # an operator-managed ~/.ssh/config alias
```

The eventual tools could select a configured `cluster` name. Job identities
must then be cluster-qualified (for example `gpu-remote:123456`), because Slurm
job IDs are not globally unique.

A transport abstraction should keep local and SSH-backed scheduler operations
behind the same submission/monitoring interface. Remote status queries should
be batched per cluster and polled less frequently than local queries to avoid
one SSH invocation per job per polling interval.

## Source policies

A future remote configuration should explicitly select one policy:

1. **Shared filesystem**: local and remote use the same source directory. No
   transfer is needed, but the shared-path assumption must be verified.
2. **Exact Git commit**: require a clean local tree and use the exact commit
   SHA remotely. This requires the remote host to obtain that commit.
3. **Immutable snapshot**: package the local source state at submission and
   transfer it to a content-addressed remote staging directory. This is the
   recommended general option because it can represent uncommitted changes.

Never silently `git pull`, check out a branch name, or `rsync --delete` into a
mutable remote checkout.

For immutable snapshots, stage under a path such as:

```text
<remote-stage-root>/<repository>/<source-content-hash>/
```

The snapshot should include tracked and non-ignored untracked source files,
while excluding `.git`, `.pi`, `node_modules`, result directories, and
operator-configured exclusions. It should have a manifest recording the local
path, Git commit when available, dirty-tree status, included-file list,
content hash, and submission timestamp. Cached snapshots are immutable and can
be reused by later jobs with the same source hash.

## Other remote concerns

- **Logs and tmux**: a remote log is not necessarily locally readable. The tmux
  adapter would need to use `ssh <host> tail -F <remote-log>` rather than a
  local `tail -F`.
- **Data**: source staging must not silently transfer datasets. Remote data
  roots and mounts need explicit configuration and validation.
- **Environments**: module loads, containers, Conda environments, and package
  installation are site-specific and should be configured explicitly.
- **Artifacts**: results normally remain remote. Retrieval should be an
  explicit operation, not an implicit side effect of submission.
- **Security**: restrict remote targets to operator-defined SSH aliases; do
  not expose an arbitrary hostname parameter to the model.
- **Federated Slurm**: before adding SSH support, check whether the sites can
  already be addressed through Slurm's native multi-cluster/federation support.

Remote Slurm should be implemented only after selecting a source policy and
validating it with a real remote site.
