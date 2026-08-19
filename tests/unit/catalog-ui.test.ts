import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(import.meta.dirname, "../../web/src/App.jsx"), "utf8");

describe("font catalog controls", () => {
  it("uses an accessible segmented switch for preview sizes", () => {
    const catalogPanelSource = appSource.slice(
      appSource.indexOf("function CatalogPanel"),
      appSource.indexOf("export function App"),
    );

    expect(catalogPanelSource).not.toContain("<select");
    expect(catalogPanelSource).toContain('role="group"');
    expect(catalogPanelSource).toContain('aria-label={copy.catalogPreviewSize}');
    expect(catalogPanelSource).toContain('aria-pressed={active}');
    expect(catalogPanelSource).toContain('onClick={() => setPreviewSize(String(size))}');
    expect(catalogPanelSource).toContain('previewSize === String(size)');
    expect(catalogPanelSource).toContain('family.previews[previewSize]');
  });
});
