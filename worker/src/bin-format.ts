export function bytesPerGlyph(width: number, height: number): number {
  const rowBytes = Math.ceil(width / 32) * 4;
  return rowBytes * height;
}
