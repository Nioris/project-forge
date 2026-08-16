# Compatibility wrapper. Canonical implementation is scripts/sync.mjs.
param(
  [switch]$DryRun,
  [switch]$VerboseOutput,
  [string]$Project,
  [switch]$Strict
)
$Args2 = @()
if ($DryRun) { $Args2 += '--dry' }
if ($Project) { $Args2 += @('--game', $Project) }
if ($Strict) { $Args2 += '--strict' }
& node (Join-Path $PSScriptRoot 'sync.mjs') @Args2
exit $LASTEXITCODE
