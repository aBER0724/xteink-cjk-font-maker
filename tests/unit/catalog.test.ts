import { describe, expect, it } from "vitest";
import { parseFontCatalog } from "../../web/catalog";


const catalog = {
  schemaVersion: 1,
  cpfontVersion: 4,
  manifestVersion: 2,
  siteUrl: "https://aber0724.github.io/crosspoint-cjk-fonts/",
  manifestUrl: "https://github.com/aBER0724/crosspoint-cjk-fonts/releases/download/sd-fonts-m2-b4/fonts.json",
  fontMakerUrl: "https://github.com/aBER0724/crosspoint-cjk-font-maker",
  previewSizes: [14, 18, 22],
  families: [
    {
      name: "NotoSansSC", description: "Simplified Chinese sans-serif", category: "sans-serif", languages: ["zh-Hans"],
      styles: ["regular"], license: "OFL-1.1", licenseStatus: "verified",
      licenseUrl: "https://example.com/license", sourceUrl: "https://example.com/source",
      previews: { "14": "https://example.com/14.png", "18": "https://example.com/18.png", "22": "https://example.com/22.png" },
      files: [8, 10, 12, 14, 16, 18, 22].map((physicalSize) => ({
        name: `NotoSansSC_${physicalSize}.cpfont`, physicalSize, byteSize: 100, sha256: "a".repeat(64), downloadUrl: `https://example.com/NotoSansSC_${physicalSize}.cpfont`,
      })),
    },
  ],
};


describe("public font catalog schema", () => {
  it("accepts the Pages schema and preserves direct HTTPS downloads", () => {
    const parsed = parseFontCatalog(catalog);

    expect(parsed.families[0].files).toHaveLength(7);
    expect(parsed.families[0].previews["18"]).toBe("https://example.com/18.png");
  });

  it("rejects incompatible schemas and unsafe asset URLs", () => {
    expect(() => parseFontCatalog({ ...catalog, cpfontVersion: 3 })).toThrow(/cpfont/);
    const unsafe = structuredClone(catalog);
    unsafe.families[0].files[0].downloadUrl = "http://example.com/font.cpfont";
    expect(() => parseFontCatalog(unsafe)).toThrow(/HTTPS/);
  });
});
