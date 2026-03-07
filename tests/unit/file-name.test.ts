import { describe, expect, it } from "vitest";
import { buildOutputName } from "../../worker/src/file-name";

describe("buildOutputName", () => {
  it("generates filename FontName_size_WxH.bin", () => {
    expect(buildOutputName("Yozai-Medium", 28, 25, 28)).toBe("Yozai-Medium_28_25x28.bin");
  });
});
