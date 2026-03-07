export function buildOutputName(
  fontName: string,
  size: number,
  width: number,
  height: number
): string {
  return `${fontName}_${size}_${width}x${height}.bin`;
}
