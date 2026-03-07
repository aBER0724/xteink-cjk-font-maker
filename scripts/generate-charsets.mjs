import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/aber/Code/xteink-cjk-font-maker';
const outDir = path.join(ROOT, 'charsets');
const workerDir = path.join(ROOT, 'worker/src');

const RANGES = [
  [0x4E00, 0x9FFF],
  [0x3400, 0x4DBF],
  [0xF900, 0xFAFF],
  [0x2E80, 0x2EFF],
  [0x2F00, 0x2FDF],
  [0x31C0, 0x31EF],
];

function* cps() {
  for (const [start, end] of RANGES) {
    for (let cp = start; cp <= end; cp += 1) yield cp;
  }
}

function buildChars(limit) {
  const chars = [];
  const seen = new Set();
  for (const cp of cps()) {
    if (seen.has(cp)) continue;
    seen.add(cp);
    chars.push(String.fromCodePoint(cp));
    if (chars.length >= limit) break;
  }
  return chars.join('');
}

const sixK = buildChars(6000);
const twentyFourK = buildChars(24000);

fs.writeFileSync(path.join(outDir, '6k.txt'), `${sixK}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, '24k.txt'), `${twentyFourK}\n`, 'utf8');
fs.writeFileSync(path.join(outDir, '65k.txt'), 'FULL_BMP\n', 'utf8');

const esc = (s) => JSON.stringify(s);
const dataTs = `export const TIER_6K_CHARS = ${esc(sixK)};\nexport const TIER_24K_CHARS = ${esc(twentyFourK)};\n`;
fs.writeFileSync(path.join(workerDir, 'charset-data.ts'), dataTs, 'utf8');

console.log(JSON.stringify({
  sixK: sixK.length,
  twentyFourK: twentyFourK.length,
  charsetDataBytes: Buffer.byteLength(dataTs),
}, null, 2));
