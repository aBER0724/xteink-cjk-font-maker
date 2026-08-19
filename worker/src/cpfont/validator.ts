import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CPFONT_PHYSICAL_SIZES, CPFONT_VERSION } from "./types.js";


const GLOBAL_HEADER_SIZE = 32;
const STYLE_TOC_SIZE = 32;
const INTERVAL_SIZE = 12;
const GLYPH_SIZE = 16;
const KERN_CLASS_SIZE = 3;
const LIGATURE_SIZE = 8;
const CPFONT_MAGIC = Buffer.from("CPFONT\0\0", "binary");

export interface ValidatedCpfontFile {
  name: string;
  physicalSize: number;
  byteSize: number;
  sha256: string;
}

interface ValidationLimits {
  maxFileBytes?: number;
  maxPackageBytes?: number;
}

export class CpfontValidationError extends Error {
  readonly code = "ERR_CPFONT_OUTPUT_INVALID";
}

function fail(message: string): never {
  throw new CpfontValidationError(message);
}

function ensureRange(offset: number, length: number, limit: number, label: string): number {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > limit) {
    fail(`${label} exceeds file boundary`);
  }
  return offset + length;
}

function validateCpfontBytes(bytes: Uint8Array, name: string): void {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < GLOBAL_HEADER_SIZE || !buffer.subarray(0, 8).equals(CPFONT_MAGIC)) {
    fail(`${name}: invalid cpfont magic`);
  }
  if (buffer.readUInt16LE(8) !== CPFONT_VERSION) {
    fail(`${name}: cpfont version must be ${CPFONT_VERSION}`);
  }
  if (buffer.readUInt16LE(10) !== 1) {
    fail(`${name}: unsupported bitmap flags`);
  }
  const styleCount = buffer.readUInt8(12);
  if (styleCount !== 1) {
    fail(`${name}: expected exactly one regular style`);
  }
  ensureRange(GLOBAL_HEADER_SIZE, STYLE_TOC_SIZE, buffer.length, `${name}: style TOC`);
  const toc = GLOBAL_HEADER_SIZE;
  if (buffer.readUInt8(toc) !== 0) {
    fail(`${name}: expected regular style ID 0`);
  }
  const intervalCount = buffer.readUInt32LE(toc + 4);
  const glyphCount = buffer.readUInt32LE(toc + 8);
  const kernLeftEntries = buffer.readUInt16LE(toc + 17);
  const kernRightEntries = buffer.readUInt16LE(toc + 19);
  const kernLeftClasses = buffer.readUInt8(toc + 21);
  const kernRightClasses = buffer.readUInt8(toc + 22);
  const ligatureCount = buffer.readUInt8(toc + 23);
  const dataOffset = buffer.readUInt32LE(toc + 24);
  if (dataOffset !== GLOBAL_HEADER_SIZE + STYLE_TOC_SIZE) {
    fail(`${name}: invalid style data offset`);
  }
  if (glyphCount > 65_536 || intervalCount > glyphCount || kernLeftEntries > 4_096 || kernRightEntries > 4_096) {
    fail(`${name}: unreasonable section counts`);
  }

  let offset = dataOffset;
  const intervalsEnd = ensureRange(offset, intervalCount * INTERVAL_SIZE, buffer.length, `${name}: intervals`);
  let expectedGlyphOffset = 0;
  let previousLast = -1;
  for (let index = 0; index < intervalCount; index += 1) {
    const entry = offset + index * INTERVAL_SIZE;
    const first = buffer.readUInt32LE(entry);
    const last = buffer.readUInt32LE(entry + 4);
    const glyphOffset = buffer.readUInt32LE(entry + 8);
    if (first > last || first <= previousLast || glyphOffset !== expectedGlyphOffset) {
      fail(`${name}: invalid Unicode interval table`);
    }
    expectedGlyphOffset += last - first + 1;
    if (expectedGlyphOffset > glyphCount) {
      fail(`${name}: Unicode intervals exceed glyph count`);
    }
    previousLast = last;
  }
  if (expectedGlyphOffset !== glyphCount) {
    fail(`${name}: Unicode intervals do not cover glyph count`);
  }
  offset = intervalsEnd;
  const glyphsOffset = offset;
  offset = ensureRange(offset, glyphCount * GLYPH_SIZE, buffer.length, `${name}: glyphs`);
  offset = ensureRange(offset, kernLeftEntries * KERN_CLASS_SIZE, buffer.length, `${name}: left kerning`);
  offset = ensureRange(offset, kernRightEntries * KERN_CLASS_SIZE, buffer.length, `${name}: right kerning`);
  offset = ensureRange(offset, kernLeftClasses * kernRightClasses, buffer.length, `${name}: kerning matrix`);
  offset = ensureRange(offset, ligatureCount * LIGATURE_SIZE, buffer.length, `${name}: ligatures`);
  const bitmapOffset = offset;
  const bitmapSize = buffer.length - bitmapOffset;
  let expectedBitmapOffset = 0;
  for (let index = 0; index < glyphCount; index += 1) {
    const glyph = glyphsOffset + index * GLYPH_SIZE;
    const width = buffer.readUInt8(glyph);
    const height = buffer.readUInt8(glyph + 1);
    const length = buffer.readUInt16LE(glyph + 8);
    const relativeOffset = buffer.readUInt32LE(glyph + 12);
    const expectedLength = Math.ceil(width * height / 4);
    if (length !== expectedLength) {
      fail(`${name}: invalid glyph bitmap length`);
    }
    if (relativeOffset !== expectedBitmapOffset || relativeOffset + length > bitmapSize) {
      fail(`${name}: invalid glyph bitmap range`);
    }
    expectedBitmapOffset += length;
  }
  if (expectedBitmapOffset !== bitmapSize) {
    fail(`${name}: unexpected trailing bitmap data`);
  }
}

function expectedNames(familyName: string): string[] {
  return CPFONT_PHYSICAL_SIZES.map((size) => `${familyName}_${size}.cpfont`);
}

export async function validateCpfontFamily(
  outputDir: string,
  familyName: string,
  limits: ValidationLimits = {},
): Promise<ValidatedCpfontFile[]> {
  const maxFileBytes = limits.maxFileBytes ?? 50 * 1024 * 1024;
  const maxPackageBytes = limits.maxPackageBytes ?? 350 * 1024 * 1024;
  const names = (await readdir(outputDir)).sort();
  const expected = expectedNames(familyName).sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    const unexpected = names.filter((name) => !expected.includes(name));
    if (unexpected.length) {
      fail(`unexpected output file: ${unexpected[0]}`);
    }
    fail(`expected exactly seven cpfont files for ${familyName}`);
  }

  let packageBytes = 0;
  const validated: ValidatedCpfontFile[] = [];
  for (const size of CPFONT_PHYSICAL_SIZES) {
    const name = `${familyName}_${size}.cpfont`;
    const filePath = path.join(outputDir, name);
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      fail(`${name}: unexpected output type`);
    }
    if (metadata.size > maxFileBytes) {
      fail(`${name}: file size limit exceeded`);
    }
    packageBytes += metadata.size;
    if (packageBytes > maxPackageBytes) {
      fail(`cpfont package size limit exceeded`);
    }
    const bytes = await readFile(filePath);
    validateCpfontBytes(bytes, name);
    validated.push({
      name,
      physicalSize: size,
      byteSize: metadata.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return validated;
}
