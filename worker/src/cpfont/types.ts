export const CPFONT_VERSION = 4 as const;
export const CPFONT_UI_SIZES = [8, 10, 12] as const;
export const DEFAULT_CPFONT_READER_SIZES = [14, 16, 18, 22] as const;
export const CPFONT_PHYSICAL_SIZES = [...CPFONT_UI_SIZES, ...DEFAULT_CPFONT_READER_SIZES] as const;

export function normalizeReaderSizes(value: unknown, allowEmpty = false): number[] | null {
  if (!Array.isArray(value) || value.length > 16 || (!allowEmpty && value.length === 0)) return null;
  const sizes: number[] = [];
  for (const entry of value) {
    if (!Number.isInteger(entry) || entry < 1 || entry > 255) return null;
    if (!sizes.includes(entry) && !CPFONT_UI_SIZES.includes(entry as 8 | 10 | 12)) sizes.push(entry);
  }
  return sizes.length > 0 || allowEmpty ? sizes.sort((left, right) => left - right) : null;
}

export function cpfontPhysicalSizes(readerSizes: readonly number[] = DEFAULT_CPFONT_READER_SIZES): number[] {
  return [...CPFONT_UI_SIZES, ...readerSizes.filter((size) => !CPFONT_UI_SIZES.includes(size as 8 | 10 | 12))]
    .sort((left, right) => left - right);
}

export type OutputFormat = "legacy-bin" | "xbf2" | "cpfont-v4";
export type CpfontCapabilityReason =
  | "ERR_CPFONT_TOOL_MISSING"
  | "ERR_CPFONT_TOOL_VERSION"
  | "ERR_CPFONT_FALLBACK_MISSING";

export interface CpfontToolkitProvenance {
  repository: string;
  commit: string;
  pythonVersion: string;
  dependencies: Record<string, string>;
}

export interface CpfontCapability {
  available: boolean;
  version: typeof CPFONT_VERSION;
  sizes: readonly number[];
  reason?: CpfontCapabilityReason;
  root?: string;
  converterPath?: string;
  fallbackPath?: string;
  pythonPath?: string;
  provenance?: CpfontToolkitProvenance;
}
