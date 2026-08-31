# Project Forge v4.68.73

## Package-safe Godot regression fixtures

This hotfix repairs the installed Forge verification gate without weakening the release package
policy. The v4.68.72 source checkout passed its Godot Web/Android regression, but the installed copy
did not: three test-only export-template ZIP files were intentionally excluded from the release
manifest together with generated archives.

This release:

- materializes the test-only Web and Android template archives inside an ephemeral runtime directory
  from package-safe, non-ZIP fixture inputs;
- rejects unsafe test-harness version segments and verifies both fixture and runtime path boundaries;
- keeps nested ZIP artifacts excluded from the immutable Forge package;
- adds a package-like regression that builds and extracts Forge, then runs the Godot Web/Android
  check from that extracted copy;
- leaves real Godot exports unchanged: production paths still require matching official export
  templates and never use the test harness fixtures.

The hotfix supersedes v4.68.72 for installation. The earlier archive remains immutable and is not
overwritten.
