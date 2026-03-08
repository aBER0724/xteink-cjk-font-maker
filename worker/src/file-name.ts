export function buildOutputName(
  fontName: string,
  size: number,
  width: number,
  height: number,
  outputFormat: "legacy-bin" | "xbf2" = "legacy-bin"
): string {
  const extension = outputFormat === "xbf2" ? ".xbf2" : ".bin";
  return `${fontName}_${size}_${width}x${height}${extension}`;
}
