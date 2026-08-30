# Project Forge v4.68.71

## Exact Godot debug console-wrapper contract

The first real Circuit Courier v1.0.0 build on Forge 4.68.70 proved the longer bounded export path, but
the independent verifier correctly rejected its debug ZIP. Godot 4.7 creates a debug-only
`<slug>.console.exe` wrapper by default; the builder packaged that legitimate file without declaring or
hashing it, then issued an engine-owned receipt for a bundle the verifier could not accept.

Forge now defines and enforces exact Windows binary sets before publication:

- production: `<slug>.exe` and `<slug>.pck` only;
- debug: `<slug>.exe`, `<slug>.console.exe` and `<slug>.pck` only;
- the console wrapper has its own SHA-256 in `manifest.artifacts.debug.consoleExe`;
- the engine-owned receipt binds that hash through the complete artifacts object;
- the verifier requires the wrapper for debug, forbids it in production and rejects every undeclared,
  missing, empty, linked or hash-mismatched binary;
- preset values that disable the debug wrapper or enable it for production fail before the expensive export.

The deterministic release suite now passes 57 scenarios, including a missing wrapper, an extra production
file, an extra debug file and numeric or malformed incompatible console-wrapper preset modes.
