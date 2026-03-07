import { describe, expect, it } from "vitest";
import { loadTier } from "../../worker/src/charset";

describe("loadTier", () => {
  it("loads 6k tier and always includes ASCII visible", () => {
    const set = loadTier("6k");
    expect(set.has(0x41)).toBe(true);
    expect(set.has("你".codePointAt(0)!)).toBe(true);
    expect(set.size).toBeGreaterThanOrEqual(6000);
  });

  it("loads 24k tier with large real character set", () => {
    const set = loadTier("24k");
    expect(set.size).toBeGreaterThanOrEqual(24000);
  });

  it("loads 65k tier as full BMP slot coverage", () => {
    const set = loadTier("65k");
    expect(set.has(0x0)).toBe(true);
    expect(set.has(0xffff)).toBe(true);
    expect(set.size).toBe(65536);
  });
});
