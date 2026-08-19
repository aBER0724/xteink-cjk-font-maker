import { describe, expect, it } from "vitest";
import { getI18nCopy, normalizeLocale } from "../../web/app";

describe("i18n copy", () => {
  it("normalizes unknown locales to zh", () => {
    expect(normalizeLocale("fr")).toBe("zh");
    expect(normalizeLocale("")).toBe("zh");
  });

  it("returns japanese and english labels", () => {
    expect(getI18nCopy("ja").title).toBe("CJK フォントコンバーター");
    expect(getI18nCopy("en").title).toBe("CJK Font Converter");
  });

  it("describes cpfont v4 as current and legacy formats as separate tools", () => {
    for (const locale of ["zh", "ja", "en"]) {
      const copy = getI18nCopy(locale);
      expect(copy.outputFormatCpfont).toMatch(/v4/i);
      expect(copy.legacyTools).toBeTruthy();
      expect(copy.cpfontSizes).toContain("8 / 10 / 12 / 14 / 16 / 18 / 22");
      expect(copy.previewApproximate).toBeTruthy();
    }
  });

  it("does not mention Cloudflare in locale descriptions", () => {
    expect(getI18nCopy("zh").description).not.toContain("Cloudflare");
    expect(getI18nCopy("ja").description).not.toContain("Cloudflare");
    expect(getI18nCopy("en").description).not.toContain("Cloudflare");
  });

  it("falls back to zh for unknown locale", () => {
    expect(getI18nCopy("xx").startConversion).toBe("开始转换");
  });
});
