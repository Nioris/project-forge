# Project Forge v4.68.70

## Bounded slow Godot export

The real Circuit Courier Phase 8 pilot exposed a Windows/Godot 4.7 cold-start path that can spend more
than three minutes initializing the editor theme and inspecting host drives before export begins. Forge's
fixed 180-second `spawnSync` limit killed that valid export and then reported only the Godot banner,
concealing the timeout.

Godot Windows release export now:

- uses the shared process-tree-bounded runner, so a genuine timeout terminates the complete child tree;
- allows a bounded 10-minute default for both production and debug variants;
- accepts `FORGE_GODOT_EXPORT_TIMEOUT_MS` only inside a validated 120000–600000 ms production range;
- returns `GODOT_RELEASE_EXPORT_TIMEOUT` as an infrastructure failure with the configured duration;
- preserves short, bounded tails from both stdout and stderr instead of letting a banner hide the cause;
- keeps immutable publication atomic, so failed or timed-out exports cannot create a release directory.

The deterministic Godot release suite now covers a hung exporter, process-tree cleanup, useful dual-stream
diagnostics, invalid timeout configuration and a valid bounded override. All previous export-template,
artifact, receipt, immutability and safe-ZIP protections remain fail-closed.

