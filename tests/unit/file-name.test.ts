import { describe, expect, it } from "vitest";
import { buildOutputName } from "../../worker/src/file-name";

describe("buildOutputName", () => {
  it("generates legacy filename FontName_size_WxH.bin by default", () => {
    expect(buildOutputName("Yozai-Medium", 28, 25, 28)).toBe("Yozai-Medium_28_25x28.bin");
  });

  it("generates xbf2 filename with xbf2 extension", () => {
    expect(buildOutputName("Yozai-Medium", 28, 25, 28, "xbf2")).toBe("Yozai-Medium_28_25x28.xbf2");
  });
});
