export function buildOutputName(
  fontName: string,
  size: number,
  width: number,
  height: number,
  outputFormat: "legacy-bin" | "xbf2" | "cpfont-v4" = "legacy-bin"
): string {
  if (outputFormat === "cpfont-v4") {
    return `${fontName}_cpfont-v4.zip`;
  }
  const extension = outputFormat === "xbf2" ? ".xbf2" : ".bin";
  return `${fontName}_${size}_${width}x${height}${extension}`;
}
