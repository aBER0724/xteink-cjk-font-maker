import { describe, expect, it } from "vitest";
import { convertFontToBin } from "../../worker/src/converter";
import { buildTestFontBytes } from "../helpers/font-fixture";

function parseXbf2(bytes: Uint8Array) {
  const header = new DataView(bytes.buffer, bytes.byteOffset, 20);
  const metricsOffset = header.getUint32(12, true);
  const glyphDataOffset = header.getUint32(16, true);
  const metricsCount = (glyphDataOffset - metricsOffset) / 12;
  const metrics = new Map<number, { left: number; top: number; advanceX: number; flags: number }>();

  for (let index = 0; index < metricsCount; index += 1) {
    const entry = new DataView(bytes.buffer, bytes.byteOffset + metricsOffset + index * 12, 12);
    metrics.set(entry.getUint32(0, true), {
      left: entry.getInt16(4, true),
      top: entry.getInt16(6, true),
      advanceX: entry.getUint16(8, true),
      flags: entry.getUint16(10, true),
    });
  }

  return {
    magic: String.fromCharCode(...bytes.slice(0, 4)),
    width: bytes[4],
    height: bytes[5],
    ascender: header.getInt16(6, true),
    descender: header.getInt16(8, true),
    lineHeight: header.getUint16(10, true),
    metricsOffset,
    glyphDataOffset,
    metrics,
  };
}

function readGlyphSlot(buffer: Uint8Array, codePoint: number, bytesPerGlyph: number): Uint8Array {
  const offset = codePoint * bytesPerGlyph;
  return buffer.slice(offset, offset + bytesPerGlyph);
}

function scaleFixtureUnits(value: number, fontSizePx = 28): number {
  return Math.round((value * fontSizePx) / 1000);
}

function countSetBits(bytes: Uint8Array): number {
  let count = 0;
  for (const value of bytes) {
    let v = value;
    while (v > 0) {
      count += v & 1;
      v >>= 1;
    }
  }
  return count;
}

describe("convertFontToBin", () => {
  it("returns fixed 7,340,032-byte buffer for 25x28 BMP slots", async () => {
    const out = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });

    const widthByte = Math.ceil(out.width / 8);
    const bytesPerGlyph = widthByte * out.height;
    expect(out.width).toBe(33);
    expect(out.height).toBe(39);
    expect(out.data.byteLength).toBe(bytesPerGlyph * 65536);
  });

  it("renders a non-empty bitmap for glyph A", async () => {
    const out = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });

    const slot = readGlyphSlot(out.data, 0x41, Math.ceil(out.width / 8) * out.height);
    expect(slot.some((v) => v !== 0)).toBe(true);
  });

  it("expands glyph box dimensions when spacing gets larger", async () => {
    const dense = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 28,
      outputHeightPx: 28,
    });
    const sparse = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 40,
      outputHeightPx: 44,
    });

    expect(sparse.width).toBeGreaterThan(dense.width);
    expect(sparse.height).toBeGreaterThan(dense.height);
  });

  it("renders heavier glyph bitmap when font weight increases", async () => {
    const normal = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 400,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });

    const bold = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 700,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });

    const bytesPerGlyph = Math.ceil(normal.width / 8) * normal.height;
    const normalBits = countSetBits(readGlyphSlot(normal.data, 0x41, bytesPerGlyph));
    const boldBits = countSetBits(readGlyphSlot(bold.data, 0x41, bytesPerGlyph));
    expect(boldBits).toBeGreaterThan(normalBits);
  });

  it("responds to slider-level weight increments with monotonic boldness", async () => {
    const w450 = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 450,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });
    const w550 = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 550,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });
    const w650 = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 650,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });

    const bytesPerGlyph = Math.ceil(w450.width / 8) * w450.height;
    const bits450 = countSetBits(readGlyphSlot(w450.data, 0x41, bytesPerGlyph));
    const bits550 = countSetBits(readGlyphSlot(w550.data, 0x41, bytesPerGlyph));
    const bits650 = countSetBits(readGlyphSlot(w650.data, 0x41, bytesPerGlyph));

    expect(bits550).toBeGreaterThan(bits450);
    expect(bits650).toBeGreaterThan(bits550);
  });

  it("packs xbf2 output with font metrics and glyph metrics when requested", async () => {
    const out = await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
      outputFormat: "xbf2",
    });

    const parsed = parseXbf2(out.data);
    const metricsA = parsed.metrics.get(0x41);
    const glyphBytes = Math.ceil(parsed.width / 8) * parsed.height;
    const slotA = out.data.slice(parsed.glyphDataOffset + 0x41 * glyphBytes, parsed.glyphDataOffset + (0x41 + 1) * glyphBytes);

    expect(parsed.magic).toBe("XBF2");
    expect(parsed.width).toBe(33);
    expect(parsed.height).toBe(39);
    expect(parsed.ascender).toBeGreaterThan(0);
    expect(parsed.lineHeight).toBeGreaterThan(parsed.ascender);
    expect(metricsA).toBeDefined();
    expect(metricsA?.advanceX).toBeGreaterThan(0);
    expect(metricsA?.flags).toBeGreaterThan(0);
    expect(slotA.some((value) => value !== 0)).toBe(true);
  });

  it("keeps xbf2 advanceX stable across weight changes", async () => {
    const normal = parseXbf2((await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 400,
      outputWidthPx: 33,
      outputHeightPx: 39,
      outputFormat: "xbf2",
    })).data);
    const bold = parseXbf2((await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      fontWeight: 650,
      outputWidthPx: 33,
      outputHeightPx: 39,
      outputFormat: "xbf2",
    })).data);

    expect(normal.metrics.get(0x41)?.advanceX).toBeDefined();
    expect(bold.metrics.get(0x41)?.advanceX).toBeDefined();
    expect(normal.metrics.get(0x41)?.advanceX).toBe(bold.metrics.get(0x41)?.advanceX);
  });

  it("encodes xbf2 metrics from glyph layout fields instead of output slot placement", async () => {
    const tight = parseXbf2((await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
      outputFormat: "xbf2",
    })).data);
    const loose = parseXbf2((await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 45,
      outputHeightPx: 51,
      outputFormat: "xbf2",
    })).data);

    const tightA = tight.metrics.get(0x41);
    const looseA = loose.metrics.get(0x41);
    const tightG = tight.metrics.get(0x67);

    expect(tightA).toEqual({
      left: scaleFixtureUnits(100),
      top: scaleFixtureUnits(800),
      advanceX: scaleFixtureUnits(1000),
      flags: 1,
    });
    expect(looseA).toEqual(tightA);
    expect(tightG).toEqual({
      left: scaleFixtureUnits(150),
      top: scaleFixtureUnits(500),
      advanceX: scaleFixtureUnits(900),
      flags: 1,
    });
  });

  it("keeps advance metrics for spacing glyphs without ink", async () => {
    const parsed = parseXbf2((await convertFontToBin({
      fontData: buildTestFontBytes(),
      tier: "6k",
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
      outputFormat: "xbf2",
    })).data);

    expect(parsed.metrics.get(0x20)).toEqual({
      left: 0,
      top: 0,
      advanceX: scaleFixtureUnits(500),
      flags: 0,
    });
  });
});
