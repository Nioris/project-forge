# Project Forge v4.68.39

## Ox Alpha retained-data preview

OpenRouter gains an `ox-alpha` whole-project preset mapped to `openrouter/stealth/ox-alpha`.
The model is currently free and designed for coding/long-horizon agent work, but its anonymous
provider retains prompts and completions.

Forge therefore rejects Ox Alpha under the default ZDR profile and requires an explicit
`--profile standard`. Documentation and the Dashboard label it as non-confidential evaluation only;
the existing 64-step OpenCode turn ceiling remains active.
