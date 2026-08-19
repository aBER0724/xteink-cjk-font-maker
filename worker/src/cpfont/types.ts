export const CPFONT_VERSION = 4 as const;
export const CPFONT_PHYSICAL_SIZES = [8, 10, 12, 14, 16, 18, 22] as const;

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
