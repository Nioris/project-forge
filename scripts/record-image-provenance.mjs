#!/usr/bin/env node
/** Record a hash-bound local claim that host-native GPT Image used the approved master image input. */
import path from 'node:path';
import { appendImageProvenance } from '../.claude/skills/status/references/image-provenance.mjs';

const args = process.argv.slice(2);
const projectRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
const option = name => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
};

try {
  const provider = option('provider') || 'codex-native';
  if (provider !== 'codex-native') throw new Error('This recorder is only for the host-native image tool; direct OpenAI API provenance is recorded automatically by openai-image.mjs');
  const result = appendImageProvenance({
    projectRoot,
    provider,
    model: option('model') || 'gpt-image-2',
    output: path.resolve(projectRoot, option('output') || ''),
    promptPack: path.resolve(projectRoot, option('prompt-pack') || ''),
    operationId: option('operation-id'),
    operation: {
      trust: 'host-attestation',
      mode: 'native-image-input',
      endpoint: 'codex.imagegen',
      usedMasterTarget: true,
      requestId: option('operation-id'),
    },
  });
  if (!result.record.promptPack || !result.record.masterTarget) throw new Error('Screen blueprint provenance requires an approved prompt pack referencing assets/target/target-frame.png');
  console.log(`[OK] Image provenance recorded: ${result.record.output.path}`);
  console.log(`     ${result.provenancePath}#${result.recordSha256}`);
} catch (error) {
  console.error(`[X] ${error.message}`);
  process.exit(1);
}
