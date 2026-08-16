// scripts/validators/trademarks.mjs
// Detects use of registered trademarks in store-listing fields.
// Yandex docs do NOT explicitly list these; this is general IP law protection.
// Triggered by past rejections: Block2048/Driftworld used "Tetris"/"Тетрис".

import path from 'node:path';
import { LEVELS, resolveGamePaths, listFiles, readJsonSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'trademarks';
export const REQUIREMENTS = ['MOD-TM'];
export const URL = 'https://yandex.ru/dev/games/doc/ru/concepts/requirements#5';

// Stop-list. Word boundary matching, case-insensitive.
// Each entry: { needle: regex, name: 'Tetris', owner: 'The Tetris Company', suggest: 'falling blocks' }
const TRADEMARKS = [
  { needle: /\btetris\b/i,        name: 'Tetris',      owner: 'The Tetris Company',     suggest: 'falling blocks / block puzzle' },
  { needle: /\bтетрис\b/i,        name: 'Тетрис',      owner: 'The Tetris Company',     suggest: 'падающие блоки / блочный пазл' },
  { needle: /\bminecraft\b/i,     name: 'Minecraft',   owner: 'Mojang/Microsoft',       suggest: 'sandbox / voxel game' },
  { needle: /\bмайнкрафт\b/i,     name: 'Майнкрафт',   owner: 'Mojang/Microsoft',       suggest: 'песочница / воксельная игра' },
  { needle: /\bmario\b/i,         name: 'Mario',       owner: 'Nintendo',               suggest: 'platformer hero' },
  { needle: /\bsonic\b/i,         name: 'Sonic',       owner: 'Sega',                   suggest: 'speed runner' },
  { needle: /\bpokemon\b/i,       name: 'Pokemon',     owner: 'Nintendo/Game Freak',    suggest: 'monster collector' },
  { needle: /\bпокемон\b/i,       name: 'Покемон',     owner: 'Nintendo/Game Freak',    suggest: 'коллекционер монстров' },
  { needle: /\bcandy\s*crush\b/i, name: 'Candy Crush', owner: 'King',                    suggest: 'sweet match-3' },
  { needle: /\bfortnite\b/i,      name: 'Fortnite',    owner: 'Epic Games',             suggest: 'battle royale' },
  { needle: /\bdoom\b/i,          name: 'Doom',        owner: 'id Software/Bethesda',   suggest: 'classic shooter' },
  { needle: /\bgta\b/i,           name: 'GTA',         owner: 'Rockstar Games',         suggest: 'open-world crime' },
  { needle: /\bcounter[\-\s]?strike\b/i, name: 'Counter-Strike', owner: 'Valve',         suggest: 'tactical FPS' },
  { needle: /\bworld of warcraft\b/i, name: 'World of Warcraft', owner: 'Blizzard',     suggest: 'MMORPG' },
  { needle: /\bzelda\b/i,         name: 'Zelda',       owner: 'Nintendo',               suggest: 'adventure quest' },
  { needle: /\bangry\s*birds\b/i, name: 'Angry Birds', owner: 'Rovio',                  suggest: 'physics puzzle' },
  { needle: /\bplants\s*vs\.?\s*zombies\b/i, name: 'Plants vs Zombies', owner: 'EA',    suggest: 'tower defense' },
  { needle: /\b2048\b/i,          name: '2048',        owner: 'Gabriele Cirulli (open)', suggest: 'OK to use — open-source name', info: true }
];

const FIELDS_TO_SCAN = ['title', 'category', 'tags', 'keywords', 'seo_description', 'about', 'how_to_play'];

function scanString(s, fileCtx) {
  const issues = [];
  if (typeof s !== 'string' || !s) return issues;
  for (const tm of TRADEMARKS) {
    if (tm.needle.test(s)) {
      const level = tm.info ? LEVELS.INFO : (tm.warning ? LEVELS.WARNING : LEVELS.BLOCKER);
      issues.push({
        id: 'MOD-TM',
        level,
        message: 'Trademark "' + tm.name + '" found (owner: ' + tm.owner + '). Suggest: ' + tm.suggest,
        citation: 'Использование чужих торговых марок может привести к юридическим претензиям. Yandex docs прямо не запрещают, но это нарушение прав владельца ТМ.',
        url: URL,
        ...fileCtx
      });
    }
  }
  return issues;
}

export function validate(gamePath) {
  const { releasePath } = resolveGamePaths(gamePath);
  const issues = [];

  const listings = listFiles(releasePath, /^store-listing-([a-z]{2})\.json$/);
  for (const file of listings) {
    const data = readJsonSafe(file);
    if (data._error) continue;
    for (const f of FIELDS_TO_SCAN) {
      const v = data[f];
      if (Array.isArray(v)) {
        v.forEach((item, idx) => {
          issues.push(...scanString(item, { file, field: f + '[' + idx + ']' }));
        });
      } else {
        issues.push(...scanString(v, { file, field: f }));
      }
    }
  }

  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
