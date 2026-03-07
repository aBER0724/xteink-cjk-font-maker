import { describe, expect, it } from "vitest";
import { validateUpload } from "../../worker/src/limits";

describe("validateUpload", () => {
  it("rejects files larger than configured max size", () => {
    expect(validateUpload({ sizeBytes: 30_000_000 })).toEqual({
      ok: false,
      code: "ERR_INVALID_FILE",
    });
  });
});
