import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CPFONT_PHYSICAL_SIZES } from "../../worker/src/cpfont/types";
import { detectCpfontToolkit, normalizeCpfontFamilyName } from "../../worker/src/cpfont/toolkit";


async function makeToolkit(version = 4, withFallback = true): Promise<string> {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "cpfont-toolkit-")),
  );
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "vendor"), { recursive: true });
  await writeFile(path.join(root, "scripts", "fontconvert_sdcard.py"), "# converter\n", "utf8");
  await writeFile(path.join(root, "scripts", "fetch_fallback.py"), "# fallback\n", "utf8");
  await writeFile(path.join(root, "scripts", "cpfont_version.py"), `CPFONT_VERSION = ${version}\n`, "utf8");
  await writeFile(path.join(root, "requirements.txt"), "freetype-py==2.5.1\n", "utf8");
  if (withFallback) {
    await writeFile(path.join(root, "vendor", "NotoSans-Regular.ttf"), "font", "utf8");
  }
  return root;
}


describe("cpfont toolkit", () => {
  it("reports a compatible explicit toolkit and seven physical sizes", async () => {
    const root = await makeToolkit();

    const capability = await detectCpfontToolkit({ env: { CPFONT_TOOL_ROOT: root }, cwd: "C:/unrelated" });

    expect(capability).toMatchObject({ available: true, version: 4, sizes: CPFONT_PHYSICAL_SIZES, root });
    expect(capability.reason).toBeUndefined();
  });

  it("uses the sibling checkout when no explicit root is configured", async () => {
    const parent = await import("node:fs/promises").then(({ mkdtemp }) =>
      mkdtemp(path.join(os.tmpdir(), "cpfont-siblings-")),
    );
    const maker = path.join(parent, "crosspoint-cjk-font-maker");
    const fonts = path.join(parent, "crosspoint-cjk-fonts");
    await mkdir(maker);
    await mkdir(path.join(fonts, "scripts"), { recursive: true });
    await mkdir(path.join(fonts, "vendor"), { recursive: true });
    await writeFile(path.join(fonts, "scripts", "fontconvert_sdcard.py"), "# converter\n");
    await writeFile(path.join(fonts, "scripts", "fetch_fallback.py"), "# fallback\n");
    await writeFile(path.join(fonts, "scripts", "cpfont_version.py"), "CPFONT_VERSION = 4\n");
    await writeFile(path.join(fonts, "requirements.txt"), "PyYAML==6.0.3\n");
    await writeFile(path.join(fonts, "vendor", "NotoSans-Regular.ttf"), "font");

    const capability = await detectCpfontToolkit({ env: {}, cwd: maker });

    expect(capability).toMatchObject({ available: true, root: fonts });
  });

  it("returns stable public reason codes without leaking local paths", async () => {
    const missing = await detectCpfontToolkit({ env: { CPFONT_TOOL_ROOT: path.join(os.tmpdir(), "missing-private") }, cwd: process.cwd() });
    expect(missing).toEqual({ available: false, version: 4, sizes: CPFONT_PHYSICAL_SIZES, reason: "ERR_CPFONT_TOOL_MISSING" });
    expect(JSON.stringify(missing)).not.toContain("missing-private");

    const wrongVersion = await detectCpfontToolkit({ env: { CPFONT_TOOL_ROOT: await makeToolkit(3) }, cwd: process.cwd() });
    expect(wrongVersion.reason).toBe("ERR_CPFONT_TOOL_VERSION");

    const missingFallback = await detectCpfontToolkit({ env: { CPFONT_TOOL_ROOT: await makeToolkit(4, false) }, cwd: process.cwd() });
    expect(missingFallback.reason).toBe("ERR_CPFONT_FALLBACK_MISSING");
  });

  it("normalizes derived family names and rejects unsafe explicit names", () => {
    expect(normalizeCpfontFamilyName("  Noto Sans SC.ttf  ")).toBe("Noto_Sans_SC");
    expect(normalizeCpfontFamilyName("悠哉字体.otf")).toBe("font");
    expect(normalizeCpfontFamilyName("../bad.ttf")).toBe("bad");
    expect(normalizeCpfontFamilyName("A".repeat(80))).toHaveLength(64);
  });
});
