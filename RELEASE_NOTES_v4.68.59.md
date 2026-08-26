# Project Forge v4.68.59

## Godot certificate-noise recovery

A restricted Codex session can run Godot successfully, emit every trusted Forge marker and produce valid
artifacts, while Windows still prints the exact host-only diagnostic
`ERROR: Failed to read the root certificate store.`. Forge previously treated that line as a fatal generic
Godot error, so the installed Q3-009 Phase 3 gate returned `environment_failure` after reaching
`CIRCUIT_COURIER_READY`.

The exact diagnostic is now nonblocking only after the current adapter proves its own success boundary:

- construct requires exit 0 and the declared smoke marker;
- capture/proof require the exact native protocol markers and retain all PNG, timeline, MJPEG and motion checks;
- tech/playtest require a parsed native report, exact protocol/mode and a usable real renderer;
- release requires exit 0 and complete non-empty EXE/PCK artifacts for both variants.

Missing markers, nonzero exits, parse/compiler errors, wrong visual states, invalid reports, broken video and
missing release artifacts still fail closed. Other certificate, TLS, display, storage and renderer errors are
not suppressed. Tool-version parsing also ignores this one diagnostic so it cannot replace the real Godot
version string.

## Terminal phase block idempotency

`phase-state complete` can exhaust a bounded repair Task and persist a terminal block. A later explicit
`phase-state block` used to rewrite the marker and then crash while recording a second result into the already
terminal Task. Terminal transitions are now checked before marker mutation:

- an equivalent block replay is a no-op and preserves the original cause byte-for-byte;
- a conflicting block or `start` returns a bounded instruction to use `reopen`, without a stack trace;
- `reopen` is the only operation that creates a fresh Task while preserving terminal history.

## Verification

- 27 construct-verifier fixture regressions pass.
- 30 native capture/proof regressions pass.
- 38 native tech/playtest adversarial checks pass.
- 42 immutable Godot release regressions pass.
- The durable execution-contract suite covers equivalent/conflicting terminal replays, guarded start and
  explicit reopen.

Q3-009 remains fail-closed until this version is installed and the real Phase 3 completion gate is repeated
inside a fresh Codex session.
