#!/usr/bin/env node
/** Deterministic Godot CLI test double. Never used unless the regression harness opts in. */
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('4.7.test.fixture');
} else if (args.includes('--import')) {
  console.log('Fixture import completed');
} else if (args.includes('--build-solutions')) {
  console.log('Fixture C# build completed');
} else {
  console.log('FORGE_SMOKE_READY');
}
