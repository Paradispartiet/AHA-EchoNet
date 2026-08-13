# Repository agent instructions

## GitHub CLI is repository-managed

- Treat `.devcontainer/devcontainer.json` and `.devcontainer/ensure-gh.sh` as the canonical GitHub CLI setup.
- Never conclude that this repository lacks GitHub CLI merely because a transient runtime does not expose `gh` in `PATH`.
- Before GitHub publishing work, run `source .devcontainer/activate-tools.sh`, then verify `gh --version` and `gh auth status`.
- If the current shell cannot be sourced, use `bash scripts/gh <arguments>`; the launcher repairs or locates GitHub CLI first.
- Do not replace or delete an existing GitHub CLI authentication configuration. Installation and authentication are separate concerns.
- Finished repository changes must be tested, pushed through a pull request, and squash-merged only after required checks are green.
