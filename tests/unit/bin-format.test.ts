import { describe, expect, it } from "vitest";
import { bytesPerGlyph, wrapBitmapFontAsXbf2 } from "../../worker/src/bin-format";

describe("bytesPerGlyph", () => {
  it("computes bytes_per_glyph = 112 for 25x28", () => {
    expect(bytesPerGlyph(25, 28)).toBe(112);
  });
});

describe("wrapBitmapFontAsXbf2", () => {
  it("wraps fixed-slot bitmap data with XBF2 header, metrics table, and glyph payload", () => {
    const width = 8;
    const height = 12;
    const glyphBytes = Math.ceil(width / 8) * height;
    const bitmap = new Uint8Array(glyphBytes * 0x10000);
    bitmap.set([0xaa, 0xbb, 0xcc], 0x41 * glyphBytes);

    const out = wrapBitmapFontAsXbf2({
      width,
      height,
      bitmapData: bitmap,
      ascender: 9,
      descender: -3,
      lineHeight: 14,
      metricsEntries: [
        {
          codePoint: 0x41,
          left: 1,
          top: 11,
          advanceX: 7,
          flags: 0x01,
        },
      ],
    });

    expect(Array.from(out.slice(0, 4))).toEqual([0x58, 0x42, 0x46, 0x32]);
    expect(out[4]).toBe(width);
    expect(out[5]).toBe(height);

    const header = new DataView(out.buffer, out.byteOffset, 20);
    expect(header.getInt16(6, true)).toBe(9);
    expect(header.getInt16(8, true)).toBe(-3);
    expect(header.getUint16(10, true)).toBe(14);
    expect(header.getUint32(12, true)).toBe(20);
    expect(header.getUint32(16, true)).toBe(32);

    const metrics = new DataView(out.buffer, out.byteOffset + 20, 12);
    expect(metrics.getUint32(0, true)).toBe(0x41);
    expect(metrics.getInt16(4, true)).toBe(1);
    expect(metrics.getInt16(6, true)).toBe(11);
    expect(metrics.getUint16(8, true)).toBe(7);
    expect(metrics.getUint16(10, true)).toBe(0x01);

    expect(Array.from(out.slice(32 + 0x41 * glyphBytes, 32 + 0x41 * glyphBytes + 3))).toEqual([0xaa, 0xbb, 0xcc]);
  });
});
