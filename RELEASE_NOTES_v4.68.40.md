# Project Forge v4.68.40

## Newest release archive runtime gate

`scripts/runtime-test.mjs --variant=production|debug|marketing` now selects the archive with the
highest numeric version instead of trusting filesystem enumeration order. The three variants are
matched exactly, so a production run cannot accidentally open a debug or marketing ZIP.

The selection logic handles numeric version ordering (`v1.10.0` is newer than `v1.9.9`) and has a
dedicated regression wired into the standard Forge drift audit. This fixes the field incident where
an Ox Alpha v0.2.1 build existed but runtime QA silently tested v0.2.0.
