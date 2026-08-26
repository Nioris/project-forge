---
title: Repeated phase block crashed after terminal Task transition
status: fixed
fixed_in: 4.68.59
date: 2026-08-26
---

# Repeated phase block crashed after terminal Task transition

## Symptom

After a rejected Phase 3 completion exhausted the bounded repair path, the Task was already terminal at
`blocked`. A following `phase-state block` rewrote the phase marker, then called `recordTaskResult` and threw
`Task ... is terminal at blocked`.

## Root cause

Terminal Task state was checked only inside the result writer, after the canonical marker had already been
mutated. `ensurePhaseTaskRun` intentionally preserves blocked phase Tasks, so it could not safely convert the
second block into a new run.

## Fix

`phase-state` now preflights the linked Task before marker writes. Equivalent block replays are idempotent;
conflicting transitions and `start` return a controlled `use reopen` error. Only explicit `reopen` creates a
new Task, and the old terminal run remains immutable.

## Regression boundary

The execution-contract audit proves byte-for-byte stability for equivalent and conflicting replays, no stack
trace on rejection, guarded `start`, and a fresh running Task after `reopen`.

## Links

- [[../plan/Q3-009-godot-pilot-release]]
