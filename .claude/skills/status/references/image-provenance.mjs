/** Hash-bound provider provenance or explicitly host-trusted native attestation for Phase 4 targets. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const IMAGE_PROVENANCE_PATH = 'assets/generated/provenance.jsonl';
export const IMAGE_PROVENANCE_KIND = 'forge.image-generation';
export const IMAGE_PROVENANCE_SCHEMA_VERSION = 2;
export const IMAGE_PROVIDERS = new Set(['codex-native', 'openai-api', 'gigachat-api']);
const PHASE4_TARGET_FRAME_PATH = 'assets/target/target-frame.png';

const sha256File = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const normalize = value => String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '');
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

function safeFile(root, rel) {
  const normalized = normalize(rel);
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  try {
    const realRoot = fs.realpathSync(path.resolve(root));
    const absolute = fs.realpathSync(path.resolve(realRoot, normalized));
    return inside(realRoot, absolute) && fs.statSync(absolute).isFile() ? { path: normalized, absolute } : null;
  } catch {
    return null;
  }
}

function projectRelative(root, value) {
  const realRoot = fs.realpathSync(path.resolve(root));
  const absolute = fs.realpathSync(path.resolve(value));
  if (!inside(realRoot, absolute)) throw new Error(`Generated image provenance path escapes the project: ${value}`);
  return normalize(path.relative(realRoot, absolute));
}

export function appendImageProvenance({ projectRoot = process.cwd(), provider, model, output, promptPack, generatedAt = new Date().toISOString(), operationId = null, operation = null } = {}) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  if (!IMAGE_PROVIDERS.has(provider)) throw new Error(`Unsupported image provenance provider: ${provider}`);
  if (!model || String(model).trim().length < 3) throw new Error('Image provenance requires a model');
  if (!Number.isFinite(Date.parse(generatedAt)) || new Date(generatedAt).toISOString() !== generatedAt) throw new Error('Image provenance requires canonical generatedAt');
  const outputPath = projectRelative(root, output);
  const outputFile = safeFile(root, outputPath);
  if (!outputFile) throw new Error('Generated output is missing inside the project');
  const packPath = promptPack ? projectRelative(root, promptPack) : null;
  const packFile = packPath ? safeFile(root, packPath) : null;
  let pack = null;
  if (packFile) {
    try { pack = JSON.parse(fs.readFileSync(packFile.absolute, 'utf8')); } catch { throw new Error('Image prompt pack is invalid JSON'); }
  }
  const master = safeFile(root, PHASE4_TARGET_FRAME_PATH);
  const usesApprovedMaster = Boolean(master && Array.isArray(pack?.references) && pack.references.map(normalize).includes(PHASE4_TARGET_FRAME_PATH));
  if (pack?.purpose === 'screen-blueprint') {
    if (!usesApprovedMaster) throw new Error(`Screen blueprint generation must reference ${PHASE4_TARGET_FRAME_PATH}`);
    if (provider === 'openai-api' && (operation?.mode !== 'edit-reference' || operation?.endpoint !== '/v1/images/edits' || operation?.usedMasterTarget !== true || operation?.trust !== 'provider-request')) {
      throw new Error('OpenAI screen blueprint provenance requires a real /v1/images/edits reference-image operation');
    }
    if (provider === 'openai-api' && (typeof operation?.requestId !== 'string' || operation.requestId.trim().length < 8)) {
      throw new Error('OpenAI screen blueprint provenance requires the provider x-request-id');
    }
    if (provider === 'codex-native' && (operation?.mode !== 'native-image-input' || operation?.endpoint !== 'codex.imagegen' || operation?.usedMasterTarget !== true || operation?.trust !== 'host-attestation')) {
      throw new Error('Native GPT Image screen blueprint attestation must declare target-frame.png as the referenced image input');
    }
    if (provider === 'gigachat-api') {
      throw new Error('GigaChat text2image cannot satisfy a screen blueprint that must preserve the approved master image; use GPT Image reference input');
    }
  }
  const providerUsage = operation?.usage && typeof operation.usage === 'object'
    ? JSON.parse(JSON.stringify(operation.usage))
    : null;
  const record = {
    schemaVersion: IMAGE_PROVENANCE_SCHEMA_VERSION,
    kind: IMAGE_PROVENANCE_KIND,
    generatedAt,
    operationId: operationId || crypto.randomUUID(),
    provider,
    model: String(model),
    purpose: pack?.purpose || null,
    state: pack?.state || null,
    viewport: pack?.viewport || null,
    promptPack: packFile ? { path: packFile.path, sha256: sha256File(packFile.absolute) } : null,
    masterTarget: usesApprovedMaster
      ? { path: PHASE4_TARGET_FRAME_PATH, sha256: sha256File(master.absolute) }
      : null,
    operation: operation ? {
      trust: String(operation.trust || ''),
      mode: String(operation.mode || ''),
      endpoint: String(operation.endpoint || ''),
      requestId: operation.requestId ? String(operation.requestId) : null,
      responseCreated: operation.responseCreated ?? null,
      inputTarget: operation.usedMasterTarget === true && usesApprovedMaster
        ? { path: PHASE4_TARGET_FRAME_PATH, sha256: sha256File(master.absolute) }
        : null,
      usage: providerUsage,
    } : null,
    output: { path: outputFile.path, sha256: sha256File(outputFile.absolute) },
  };
  const provenance = path.join(root, IMAGE_PROVENANCE_PATH);
  fs.mkdirSync(path.dirname(provenance), { recursive: true });
  const line = JSON.stringify(record);
  const lineNumber = fs.existsSync(provenance)
    ? fs.readFileSync(provenance, 'utf8').split(/\r?\n/u).filter(Boolean).length + 1
    : 1;
  fs.appendFileSync(provenance, `${line}\n`, 'utf8');
  return { record, line: lineNumber, recordSha256: crypto.createHash('sha256').update(line).digest('hex'), provenancePath: IMAGE_PROVENANCE_PATH };
}

export function findImageProvenance({ projectRoot = process.cwd(), outputPath, outputSha256, state, viewport } = {}) {
  const root = path.resolve(projectRoot);
  const provenance = safeFile(root, IMAGE_PROVENANCE_PATH);
  if (!provenance) return null;
  const lines = fs.readFileSync(provenance.absolute, 'utf8').split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let record;
    try { record = JSON.parse(lines[index]); } catch { continue; }
    if (record?.schemaVersion !== IMAGE_PROVENANCE_SCHEMA_VERSION || record?.kind !== IMAGE_PROVENANCE_KIND) continue;
    if (normalize(record?.output?.path) !== normalize(outputPath) || record?.output?.sha256 !== outputSha256) continue;
    if (record?.state !== state || record?.viewport !== viewport) continue;
    const promptPack = safeFile(root, record?.promptPack?.path);
    const master = safeFile(root, record?.masterTarget?.path);
    const output = safeFile(root, record?.output?.path);
    if (!IMAGE_PROVIDERS.has(record.provider) || !record.model || record.purpose !== 'screen-blueprint'
      || !['mobile', 'desktop'].includes(record.viewport) || !promptPack || !master || !output
      || record.promptPack.sha256 !== sha256File(promptPack.absolute)
      || normalize(record.masterTarget.path) !== PHASE4_TARGET_FRAME_PATH
      || record.masterTarget.sha256 !== sha256File(master.absolute)
      || record.output.sha256 !== sha256File(output.absolute)
      || normalize(record.operation?.inputTarget?.path) !== PHASE4_TARGET_FRAME_PATH
      || record.operation?.inputTarget?.sha256 !== sha256File(master.absolute)
      || !Number.isFinite(Date.parse(record.generatedAt)) || new Date(record.generatedAt).toISOString() !== record.generatedAt) continue;
    if (!['codex-native', 'openai-api'].includes(record.provider) || !/gpt[-_ ]?image/iu.test(record.model)) continue;
    if (record.provider === 'openai-api' && (record.operation?.trust !== 'provider-request' || record.operation?.mode !== 'edit-reference'
      || record.operation?.endpoint !== '/v1/images/edits'
      || typeof record.operation?.requestId !== 'string' || record.operation.requestId.trim().length < 8)) continue;
    if (record.provider === 'codex-native' && (record.operation?.trust !== 'host-attestation' || record.operation?.mode !== 'native-image-input'
      || record.operation?.endpoint !== 'codex.imagegen')) continue;
    return {
      path: IMAGE_PROVENANCE_PATH,
      line: index + 1,
      recordSha256: crypto.createHash('sha256').update(lines[index]).digest('hex'),
      record,
    };
  }
  return null;
}
