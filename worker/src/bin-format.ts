const XBF2_MAGIC = [0x58, 0x42, 0x46, 0x32] as const;
const XBF2_HEADER_SIZE = 20;
const XBF2_GLYPH_METRICS_SIZE = 12;
const BMP_SLOT_COUNT = 0x10000;

export function bytesPerGlyph(width: number, height: number): number {
  const rowBytes = Math.ceil(width / 32) * 4;
  return rowBytes * height;
}

export interface Xbf2GlyphMetricsEntry {
  codePoint: number;
  left: number;
  top: number;
  advanceX: number;
  flags: number;
}

interface Xbf2WriterInput {
  width: number;
  height: number;
  bitmapData: Uint8Array;
  ascender: number;
  descender: number;
  lineHeight: number;
  metricsEntries: Xbf2GlyphMetricsEntry[];
}

function xbf2BytesPerGlyph(width: number, height: number): number {
  return Math.ceil(width / 8) * height;
}

export const XBF2_GLYPH_FLAG_HAS_INK = 0x01;

export function wrapBitmapFontAsXbf2(input: Xbf2WriterInput): Uint8Array {
  const width = Math.max(1, Math.min(255, Math.trunc(input.width)));
  const height = Math.max(1, Math.min(255, Math.trunc(input.height)));
  const glyphBytes = xbf2BytesPerGlyph(width, height);
  const expectedBitmapBytes = glyphBytes * BMP_SLOT_COUNT;

  if (input.bitmapData.byteLength !== expectedBitmapBytes) {
    throw new Error(`bitmapData size mismatch: expected ${expectedBitmapBytes}, got ${input.bitmapData.byteLength}`);
  }

  const metricsEntries = input.metricsEntries;
  const metricsTableOffset = XBF2_HEADER_SIZE;
  const glyphDataOffset = metricsTableOffset + metricsEntries.length * XBF2_GLYPH_METRICS_SIZE;
  const out = new Uint8Array(glyphDataOffset + input.bitmapData.byteLength);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  out.set(XBF2_MAGIC, 0);
  out[4] = width;
  out[5] = height;
  view.setInt16(6, input.ascender, true);
  view.setInt16(8, input.descender, true);
  view.setUint16(10, input.lineHeight, true);
  view.setUint32(12, metricsTableOffset, true);
  view.setUint32(16, glyphDataOffset, true);

  for (let index = 0; index < metricsEntries.length; index += 1) {
    const entry = metricsEntries[index];
    const offset = metricsTableOffset + index * XBF2_GLYPH_METRICS_SIZE;
    view.setUint32(offset, entry.codePoint, true);
    view.setInt16(offset + 4, entry.left, true);
    view.setInt16(offset + 6, entry.top, true);
    view.setUint16(offset + 8, entry.advanceX, true);
    view.setUint16(offset + 10, entry.flags, true);
  }

  out.set(input.bitmapData, glyphDataOffset);
  return out;
}
