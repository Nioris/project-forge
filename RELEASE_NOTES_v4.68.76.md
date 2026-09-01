# Project Forge v4.68.76

## External security vault is now an enforced invariant

- Forge refuses initialization, validation and signing when the selected data root is inside the project.
- The refusal happens before Forge creates a directory or writes security data.
- Existing managed `.gitignore` blocks are refreshed in place instead of remaining stale.
- New and refreshed project ignore rules include `forge-data/` while preserving user-authored rules.
- Regression coverage proves both the fail-closed vault location and managed-ignore upgrade path.

The normal vault remains the workspace-level sibling `forge-data/security/`. Only
`forge.identity.json` is public project state; keys, encrypted passwords and private paths remain external.
