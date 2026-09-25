# Workspace publication — 2026-09-25

This is an archival/snapshot branch, NOT a production release or a verification-status upgrade.
No merge to main is authorized or performed. Main has advanced independently.

All six workspace artifact directories are preserved byte-for-byte under
`docs/arena-evidence/2026-09-25/`, with source-to-destination mapping, SHA256 and Git
blob IDs in `publication/ARTIFACT_MANIFEST.json`. Historical reports keep their
original dated verdicts and SHA; uploading them does not make them current proof.

The previously uncommitted working-tree state is included faithfully: 22 executable
bits changed from 755 to644, plus deletion of the monitoring/alert-rules.yml symlink.
These were present before this publication. They are NOT new remediation and need
explicit review/restoration before merging a runnable branch. The clean tested sync
commit is separately published on arena-sync/current-head-20260925.

Old local branches and stash snapshots are published as separate refs for recovery;
no stash is applied, no force push and no merge to main. Access tokens, .git/config,
credential helpers, dependency trees and temporary secret material are NOT artifacts.
Credentials were not revoked.

Large artifacts are intentionally absent from the local working checkout after
publication (skip-worktree), but are committed and recoverable from GitHub/Git.
This keeps /home/user below100MiB. The external temporary import sources are removed
only after a fresh GitHub tree verification matches every recorded artifact blob.
