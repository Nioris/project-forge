# Project Forge v4.68.41

## Canonical nine-phase state integrity

All nine Forge phases now have executable, schema-checked completion contracts. Each contract
requires exact evidence files and relevant project checks, so empty, unrelated, directory-only or
counterfeit evidence cannot advance durable phase state.

The former seven-step pipeline checker no longer owns progression. It is now a compatibility view
over the same canonical nine-phase status used by every agent. Phase skills were aligned with their
contracts, including explicit technical, listing, test and release reports.

The MCP server now exposes only the read-only verifiers declared in `mcp-server/verifiers.json`,
with explicit scope, applicable phases and timeouts. Internal regressions and mutating scripts are
hidden and cannot become tools merely because their filenames start with `check-`.
