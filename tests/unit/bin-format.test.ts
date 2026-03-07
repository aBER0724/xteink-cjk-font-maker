import { describe, expect, it } from "vitest";
import { bytesPerGlyph } from "../../worker/src/bin-format";

describe("bytesPerGlyph", () => {
  it("computes bytes_per_glyph = 112 for 25x28", () => {
    expect(bytesPerGlyph(25, 28)).toBe(112);
  });
});
