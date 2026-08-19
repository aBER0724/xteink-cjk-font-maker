import { strToU8, zipSync } from "fflate";
import type { CpfontConversionResult } from "./runner.js";
import { CPFONT_PHYSICAL_SIZES, CPFONT_VERSION } from "./types.js";


interface CpfontPackageInput {
  conversion: CpfontConversionResult;
  familyName: string;
  sourceName: string;
  sourceSha256: string;
  fallbackSha256: string;
  forceAutohint: boolean;
  toolkitRepository: string;
  toolkitCommit: string;
  pythonVersion: string;
  dependencies: Record<string, string>;
}

export interface CpfontPackage {
  name: string;
  data: Uint8Array;
}

const FIXED_ZIP_TIME = new Date("1980-01-01T00:00:00.000Z");

export async function buildCpfontPackage(input: CpfontPackageInput): Promise<CpfontPackage> {
  const folder = `${input.familyName}/`;
  const entries: Record<string, [Uint8Array, { level: number; mtime: Date }]> = {};
  for (const file of input.conversion.files) {
    entries[`${folder}${file.name}`] = [await input.conversion.readFile(file.name), { level: 0, mtime: FIXED_ZIP_TIME }];
  }
  const sums = input.conversion.files.map((file) => `${file.sha256}  ${file.name}`).join("\n") + "\n";
  entries[`${folder}SHA256SUMS`] = [strToU8(sums), { level: 6, mtime: FIXED_ZIP_TIME }];
  const provenance = {
    schemaVersion: 1,
    cpfontVersion: CPFONT_VERSION,
    physicalSizes: CPFONT_PHYSICAL_SIZES,
    uiSizes: [8, 10, 12],
    readerSizes: [14, 16, 18, 22],
    intervals: "latin-ext,cjk",
    forceAutohint: input.forceAutohint,
    source: { filename: input.sourceName, sha256: input.sourceSha256 },
    fallback: { sha256: input.fallbackSha256 },
    converter: { repository: input.toolkitRepository, commit: input.toolkitCommit },
    runtime: { python: input.pythonVersion, dependencies: input.dependencies },
    files: input.conversion.files,
  };
  entries[`${folder}build.json`] = [
    strToU8(JSON.stringify(provenance, null, 2) + "\n"),
    { level: 6, mtime: FIXED_ZIP_TIME },
  ];
  return {
    name: `${input.familyName}_cpfont-v4.zip`,
    data: zipSync(entries),
  };
}
