// Safely extracts literal {op:'say', who, text, vtag} commands from JS source.
// Usage: node extract_says.js script_ch01.js [script_ch02.js ...] > says.json
//
// This parser is intentionally STATIC: it never evals/executes the game script.
// Only literal string values are extracted. Dynamic expressions (variables,
// concatenation, template literals with ${...}) are skipped rather than executed.
// Adapt the key names below if a project's dialogue command shape differs.
const fs = require('fs');
const crypto = require('crypto');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node extract_says.js <script_chXX.js>...');
  process.exit(1);
}

function readQuoted(src, start) {
  const quote = src[start];
  let i = start + 1;
  let out = '';
  let dynamicTemplate = false;
  while (i < src.length) {
    const ch = src[i++];
    if (ch === quote) return { value: out, end: i, dynamicTemplate };
    if (quote === '`' && ch === '$' && src[i] === '{') dynamicTemplate = true;
    if (ch !== '\\') { out += ch; continue; }
    if (i >= src.length) break;
    const e = src[i++];
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
    if (Object.prototype.hasOwnProperty.call(simple, e)) { out += simple[e]; continue; }
    if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(src.slice(i, i + 2))) {
      out += String.fromCharCode(parseInt(src.slice(i, i + 2), 16)); i += 2; continue;
    }
    if (e === 'u') {
      const m = src.slice(i).match(/^\{([0-9a-fA-F]{1,6})\}/) || src.slice(i).match(/^([0-9a-fA-F]{4})/);
      if (m) {
        out += String.fromCodePoint(parseInt(m[1], 16)); i += m[0].length; continue;
      }
    }
    if (e === '\n') continue;
    if (e === '\r') { if (src[i] === '\n') i++; continue; }
    out += e;
  }
  return null;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  let braceDepth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') {
      i += 2; while (i < src.length && src[i] !== '\n') i++; continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = readQuoted(src, i);
      if (!q) break;
      tokens.push({ type: 'string', value: q.value, dynamic: q.dynamicTemplate, braceDepth, pos: i });
      i = q.end; continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = src.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      tokens.push({ type: 'id', value: m[0], braceDepth, pos: i });
      i += m[0].length; continue;
    }
    if (ch === '{') {
      tokens.push({ type: 'punct', value: ch, braceDepth, pos: i });
      braceDepth++; i++; continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      tokens.push({ type: 'punct', value: ch, braceDepth, pos: i });
      i++; continue;
    }
    if (':,[]()'.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, braceDepth, pos: i });
      i++; continue;
    }
    i++;
  }
  return tokens;
}

function keyName(tok) {
  return tok && (tok.type === 'id' || tok.type === 'string') ? tok.value : null;
}

function enclosingObject(tokens, keyIndex) {
  const depth = tokens[keyIndex].braceDepth;
  for (let i = keyIndex - 1; i >= 0; i--) {
    if (tokens[i].value === '{' && tokens[i].braceDepth === depth - 1) return i;
  }
  return -1;
}

function objectEnd(tokens, startIndex) {
  const depth = tokens[startIndex].braceDepth;
  for (let i = startIndex + 1; i < tokens.length; i++) {
    if (tokens[i].value === '}' && tokens[i].braceDepth === depth) return i;
  }
  return -1;
}

function literalProps(tokens, startIndex, endIndex) {
  const propertyDepth = tokens[startIndex].braceDepth + 1;
  const out = {};
  for (let i = startIndex + 1; i + 2 < endIndex; i++) {
    if (tokens[i].braceDepth !== propertyDepth) continue;
    const key = keyName(tokens[i]);
    if (!key || tokens[i + 1]?.value !== ':' || tokens[i + 1].braceDepth !== propertyDepth) continue;
    const value = tokens[i + 2];
    if (value?.type !== 'string' || value.braceDepth !== propertyDepth || value.dynamic) continue;
    if (key === 'op' || key === 'who' || key === 'text' || key === 'vtag') out[key] = value.value;
  }
  return out;
}

const result = [];
let skippedDynamic = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const tokens = tokenize(src);
  const seenObjects = new Set();
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (keyName(tokens[i]) !== 'op' || tokens[i + 1]?.value !== ':') continue;
    const op = tokens[i + 2];
    if (op?.type !== 'string' || op.dynamic || op.value !== 'say') continue;
    const start = enclosingObject(tokens, i);
    if (start < 0 || seenObjects.has(start)) continue;
    const end = objectEnd(tokens, start);
    if (end < 0) continue;
    seenObjects.add(start);
    const p = literalProps(tokens, start, end);
    if (p.op !== 'say') continue;
    if (typeof p.text !== 'string' || !p.text.trim()) { skippedDynamic++; continue; }
    const who = p.who || 'narrator';
    const text = p.text;
    const vtag = (p.vtag || '').trim();
    const hashInput = vtag ? `${who}|${vtag}|${text}` : `${who}|${text}`;
    const hash = crypto.createHash('md5').update(hashInput).digest('hex').slice(0, 12);
    const item = { who, text, hash };
    if (vtag) item.vtag = vtag;
    result.push(item);
  }
}

const seen = new Set();
const unique = [];
for (const item of result) {
  if (!seen.has(item.hash)) { seen.add(item.hash); unique.push(item); }
}
console.log(JSON.stringify(unique, null, 2));
console.error(`extracted: ${result.length} literal lines, unique by hash: ${unique.length}` +
  (skippedDynamic ? `; skipped non-literal/dynamic: ${skippedDynamic}` : ''));
