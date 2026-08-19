import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(import.meta.dirname, "../../web/src/App.jsx"), "utf8");

describe("font catalog navigation", () => {
  it("links to the standalone catalog without embedding or fetching it", () => {
    expect(appSource).toContain(
      'const FONT_CATALOG_PAGE_URL = import.meta.env.VITE_FONT_CATALOG_PAGE_URL || "https://aber0724.github.io/crosspoint-cjk-fonts/";',
    );
    expect(appSource).toContain('href={FONT_CATALOG_PAGE_URL}');
    expect(appSource).toContain('target="_blank"');
    expect(appSource).toContain('rel="noopener noreferrer"');
    expect(appSource).toContain('{copy.fontLibrary}');
    expect(appSource).not.toContain("function CatalogPanel");
    expect(appSource).not.toContain("fetchFontCatalog");
    expect(appSource).not.toContain("VITE_FONT_CATALOG_URL");
    expect(appSource).not.toContain('["library", copy.fontLibrary]');
  });
});
