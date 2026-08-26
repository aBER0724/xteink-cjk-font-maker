import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { buildCpfontPackage } from "../../worker/src/cpfont/package";
import type { CpfontConversionResult } from "../../worker/src/cpfont/runner";


function conversion(sizes = [8, 10, 12, 14, 16, 18, 22]): CpfontConversionResult {
  const files = sizes.map((physicalSize) => ({
    name: `ExampleCJK_${physicalSize}.cpfont`,
    physicalSize,
    byteSize: 1,
    sha256: `${physicalSize}`.padStart(64, "0"),
  }));
  return {
    files,
    outputDir: "unused",
    inputPath: "unused",
    async readFile(name: string) {
      const size = Number(name.match(/_(\d+)\.cpfont$/)?.[1]);
      return new Uint8Array([size]);
    },
  };
}


describe("cpfont family ZIP package", () => {
  it("is deterministic and contains seven files, checksums, and provenance", async () => {
    const input = {
      conversion: conversion([8, 10, 12, 14, 18, 22]),
      familyName: "ExampleCJK",
      sourceName: "Source Font.ttf",
      sourceSha256: "a".repeat(64),
      fallbackSha256: "b".repeat(64),
      forceAutohint: false,
      readerSizes: [14, 18, 22],
      toolkitRepository: "https://github.com/aBER0724/crosspoint-cjk-fonts",
      toolkitCommit: "c242803dbd47f13fa5886bf0701db72871709d23",
      pythonVersion: "3.11.9",
      dependencies: { "freetype-py": "2.5.1", fonttools: "4.63.0" },
    };

    const first = await buildCpfontPackage(input);
    const second = await buildCpfontPackage(input);

    expect(first.name).toBe("ExampleCJK.cpfontpkg");
    expect(first.data).toEqual(second.data);
    const entries = unzipSync(first.data);
    expect(Object.keys(entries)).toEqual([
      "ExampleCJK/ExampleCJK_8.cpfont",
      "ExampleCJK/ExampleCJK_10.cpfont",
      "ExampleCJK/ExampleCJK_12.cpfont",
      "ExampleCJK/ExampleCJK_14.cpfont",
      "ExampleCJK/ExampleCJK_18.cpfont",
      "ExampleCJK/ExampleCJK_22.cpfont",
      "ExampleCJK/SHA256SUMS",
      "ExampleCJK/manifest.json",
      "ExampleCJK/build.json",
    ]);
    const sums = new TextDecoder().decode(entries["ExampleCJK/SHA256SUMS"]);
    expect(sums).toContain(`${"8".padStart(64, "0")}  ExampleCJK_8.cpfont`);
    const provenance = JSON.parse(new TextDecoder().decode(entries["ExampleCJK/build.json"]));
    expect(provenance).toMatchObject({
      schemaVersion: 1,
      cpfontVersion: 4,
      physicalSizes: [8, 10, 12, 14, 18, 22],
      readerSizes: [14, 18, 22],
      intervals: "latin-ext,cjk",
      source: { filename: "Source Font.ttf", sha256: "a".repeat(64) },
      fallback: { sha256: "b".repeat(64) },
      converter: { commit: "c242803dbd47f13fa5886bf0701db72871709d23" },
    });
  });

  it("builds a UI-only package with fixed UI sizes", async () => {
    const result = await buildCpfontPackage({
      conversion: conversion([8, 10, 12]),
      familyName: "ExampleUI",
      sourceName: "Source.ttf",
      sourceSha256: "a".repeat(64),
      fallbackSha256: "b".repeat(64),
      forceAutohint: false,
      readerSizes: [],
      packageRole: "ui",
      toolkitRepository: "https://github.com/aBER0724/crosspoint-cjk-fonts",
      toolkitCommit: "c242803dbd47f13fa5886bf0701db72871709d23",
      pythonVersion: "3.11.9",
      dependencies: {},
    });
    const entries = unzipSync(result.data);
    const manifest = JSON.parse(new TextDecoder().decode(entries["ExampleUI/manifest.json"]));
    expect(manifest).toMatchObject({ role: "ui", uiSizes: [8, 10, 12], readerSizes: [] });
    expect(manifest.fonts.map((font: { size: number }) => font.size)).toEqual([8, 10, 12]);
    expect(Object.keys(entries).filter((name) => name.endsWith(".cpfont"))).toHaveLength(3);
  });
});
