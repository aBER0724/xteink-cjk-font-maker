import { describe, expect, it } from "vitest";
import { convertFontToBin } from "../../worker/src/converter";
import { buildTestFontBytes } from "../helpers/font-fixture";

function readGlyphSlot(data: Uint8Array, codePoint: number, bytesPerGlyph: number): Uint8Array {
  const offset = codePoint * bytesPerGlyph;
  return data.slice(offset, offset + bytesPerGlyph);
}

function mirrorY(slot: Uint8Array, widthByte: number, height: number): Uint8Array {
  const out = new Uint8Array(slot.length);
  for (let y = 0; y < height; y += 1) {
    const src = y * widthByte;
    const dst = (height - 1 - y) * widthByte;
    out.set(slot.slice(src, src + widthByte), dst);
  }
  return out;
}

describe("converter compatibility", () => {
  it("default mode equals compatFlipY=true", async () => {
    const baseInput = {
      fontData: buildTestFontBytes(),
      tier: "65k" as const,
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
    };

    const byDefault = await convertFontToBin(baseInput);
    const explicit = await convertFontToBin({ ...baseInput, compatFlipY: true });

    expect(byDefault.width).toBe(explicit.width);
    expect(byDefault.height).toBe(explicit.height);
    expect(byDefault.bytesPerGlyph).toBe(explicit.bytesPerGlyph);

    const slotDefault = readGlyphSlot(byDefault.data, 0x41, byDefault.bytesPerGlyph);
    const slotExplicit = readGlyphSlot(explicit.data, 0x41, explicit.bytesPerGlyph);
    expect(slotDefault).toEqual(slotExplicit);
  });

  it("compatFlipY=true is exact vertical mirror of compatFlipY=false", async () => {
    const baseInput = {
      fontData: buildTestFontBytes(),
      tier: "65k" as const,
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
    };

    const flipped = await convertFontToBin({ ...baseInput, compatFlipY: true });
    const plain = await convertFontToBin({ ...baseInput, compatFlipY: false });

    const slotFlipped = readGlyphSlot(flipped.data, 0x41, flipped.bytesPerGlyph);
    const slotPlain = readGlyphSlot(plain.data, 0x41, plain.bytesPerGlyph);

    expect(slotFlipped).toEqual(mirrorY(slotPlain, Math.ceil(plain.width / 8), plain.height));
  });
});
