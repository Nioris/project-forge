# Project Forge v4.68.48

## Unicode-aware Phase 1 evidence gate

Phase 1 validation now treats Cyrillic labels as real word tokens. Numeric KPI lines marked with
`гипотеза`, `гипотезы` or `предположение` pass without an English workaround, while labels embedded
inside larger words do not.

The same Unicode boundary fix closes related Russian-language bypasses in KPI and research checks.
Uncited claims such as `Удержание: 15%`, inflected competitor/market/platform assertions and positive
`подтверждено` statements are rejected consistently; explicit Russian no-evidence declarations remain
valid. Regression coverage preserves the existing English `TBD`, `hypothesis` and citation behavior.
