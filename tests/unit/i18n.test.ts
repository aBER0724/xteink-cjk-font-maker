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

  it("describes the cpfont family package and separates legacy tools", () => {
    for (const locale of ["zh", "ja", "en"]) {
      const copy = getI18nCopy(locale);
      expect(copy.outputFormatCpfont).toMatch(/cpfontpkg/i);
      expect(copy.legacyTools).toBeTruthy();
      expect(copy.cpfontSizes).toContain("8 / 10 / 12");
      expect(copy.cpfontPreset).toBeTruthy();
      expect(copy.cpfontPresetFamily).toBeTruthy();
      expect(copy.cpfontPresetUi).toBeTruthy();
      expect(copy.cpfontPresetUiHint).toContain("8 / 10 / 12");
      expect(copy.readerSizes).toBeTruthy();
      expect(copy.readerSizesHint).toContain("14");
      expect(copy.previewApproximate).toBeTruthy();
      expect(copy.fontLibrary).toBeTruthy();
      expect(copy.makeCpfont).toBeTruthy();
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
