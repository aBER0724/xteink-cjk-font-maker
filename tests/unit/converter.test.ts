import { describe, expect, it } from "vitest";
import { convertFontToBin } from "../../worker/src/converter";
import { buildTestFontBytes } from "../helpers/font-fixture";

function readGlyphSlot(buffer: Uint8Array, codePoint: number, bytesPerGlyph: number): Uint8Array {
  const offset = codePoint * bytesPerGlyph;
  return buffer.slice(offset, offset + bytesPerGlyph);
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
});
