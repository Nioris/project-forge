---
title: Successful Godot run blocked by Windows root-certificate warning
status: fixed
fixed_in: 4.68.59
date: 2026-08-26
---

# Successful Godot run blocked by Windows root-certificate warning

## Symptom

Inside the Q3-009 Codex sandbox, Godot exited successfully and printed
`CIRCUIT_COURIER_READY`, but `check-godot-project.mjs` returned `environment_failure` because the same output
also contained `ERROR: Failed to read the root certificate store.`. Capture, proof, tech, playtest and release
shared the same broad `ERROR:` classification.

## Root cause

The Windows sandbox denied certificate-store access without preventing local game execution. Forge evaluated
generic error lines before each adapter's stronger success evidence. The v4.68.58 isolation fix correctly
removed profile crashes and editor-import stalls, but classified this nonblocking diagnostic too early.

## Fix

Forge recognizes only the exact anchored root-store diagnostic. It may be filtered only after the active
adapter proves exit/protocol/artifact success. All project errors and every other host/network/rendering error
remain authoritative. Invalid downstream artifacts still fail their normal checks instead of being relabeled
as an environment-only problem.

## Regression boundary

Construct, capture/proof, tech/playtest and release fixtures cover both the successful-noise case and negative
cases with missing markers, nonzero exit, parse error, wrong state, malformed proof video and missing PCK.

## Links

- [[godot-clean-profile-editor-import]]
- [[../plan/Q3-009-godot-pilot-release]]
