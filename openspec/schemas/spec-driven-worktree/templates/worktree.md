---
kind: openspec-worktree-binding
version: 1
status: unverified
change: <name>
schema: spec-driven-worktree
branch: <branch-name>
worktreePath: <absolute-worktree-path>
baseRef: <explicit-local-base-ref>
baseSha: <base-commit-sha>
repositoryRoot: <canonical-repository-root>
gitCommonDir: <canonical-git-common-directory>
bindingId: <binding-id>
receiptPath: <companion-receipt-path>
---

# Worktree Binding (Non-authoritative)

This file is a human-readable projection for the `spec-driven-worktree`
OpenSpec artifact. It is not a Git lock, a lease, a transaction journal, or an
authorization token.

- **Change**: `<name>`
- **Schema**: `spec-driven-worktree`
- **Binding status**: `unverified`
- **Branch**: `<branch-name>`
- **Worktree path**: `<absolute-worktree-path>`
- **Base ref**: `<explicit-local-base-ref>`
- **Base SHA**: `<base-commit-sha>`
- **Repository root**: `<canonical-repository-root>`
- **Git common directory**: `<canonical-git-common-directory>`
- **Binding ID**: `<binding-id>`
- **Companion receipt**: `<companion-receipt-path>`

The `openspec-worktree` companion may replace these placeholders only after a
successful typed operation and a fresh postcondition inspection. The presence
of this file, its front matter, or a matching-looking path never proves that a
Git worktree exists or is owned by this change. Current Git registration,
canonical identity, and the companion's structured receipt are authoritative.

Do not hand-edit this projection to bypass a blocked, stale, unknown, or
recovery-required worktree operation.
