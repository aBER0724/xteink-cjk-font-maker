import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { CPFONT_PHYSICAL_SIZES, CPFONT_VERSION, type CpfontCapability, type CpfontCapabilityReason } from "./types.js";

interface ToolkitDetectionOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  cwd?: string;
}

function unavailable(reason: CpfontCapabilityReason): CpfontCapability {
  return { available: false, version: CPFONT_VERSION, sizes: CPFONT_PHYSICAL_SIZES, reason };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function versionFromSource(source: string): number | null {
  const match = source.match(/^CPFONT_VERSION\s*=\s*(\d+)\s*$/m);
  return match ? Number.parseInt(match[1], 10) : null;
}

function candidateRoot(options: ToolkitDetectionOptions): string {
  const env = options.env ?? process.env;
  if (env.CPFONT_TOOL_ROOT) {
    return path.resolve(env.CPFONT_TOOL_ROOT);
  }
  return path.resolve(options.cwd ?? process.cwd(), "..", "crosspoint-cjk-fonts");
}

export async function detectCpfontToolkit(options: ToolkitDetectionOptions = {}): Promise<CpfontCapability> {
  const root = candidateRoot(options);
  const converterPath = path.join(root, "scripts", "fontconvert_sdcard.py");
  const versionPath = path.join(root, "scripts", "cpfont_version.py");
  const fetchFallbackPath = path.join(root, "scripts", "fetch_fallback.py");
  const requirementsPath = path.join(root, "requirements.txt");
  const fallbackPath = path.join(root, "vendor", "NotoSans-Regular.ttf");
  const required = [converterPath, versionPath, fetchFallbackPath, requirementsPath];

  if (!(await Promise.all(required.map(exists))).every(Boolean)) {
    return unavailable("ERR_CPFONT_TOOL_MISSING");
  }
  const version = versionFromSource(await readFile(versionPath, "utf8"));
  if (version !== CPFONT_VERSION) {
    return unavailable("ERR_CPFONT_TOOL_VERSION");
  }
  if (!(await exists(fallbackPath))) {
    return unavailable("ERR_CPFONT_FALLBACK_MISSING");
  }

  return {
    available: true,
    version: CPFONT_VERSION,
    sizes: CPFONT_PHYSICAL_SIZES,
    root,
    converterPath,
    fallbackPath,
    pythonPath: (options.env ?? process.env).CPFONT_PYTHON || (process.platform === "win32" ? "python" : "python3"),
  };
}

export function normalizeCpfontFamilyName(value: string): string {
  const basename = path.basename(value.trim()).replace(/\.[^.]+$/, "");
  const normalized = basename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "font";
}

export function isValidCpfontFamilyName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
