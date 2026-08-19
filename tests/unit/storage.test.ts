import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileSystemStorage } from "../../worker/src/storage";


describe("filesystem job storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes concurrent atomic writes to one job without temp-path collisions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_777);
    const root = await import("node:fs/promises").then(({ mkdtemp }) =>
      mkdtemp(path.join(os.tmpdir(), "font-maker-storage-")),
    );
    const storage = createFileSystemStorage(root);
    const values = Array.from({ length: 24 }, (_, index) =>
      JSON.stringify({ index, payload: String(index).repeat(4096) }),
    );

    await expect(Promise.all(values.map((value) => storage.writeJob("same-job", value)))).resolves.toHaveLength(24);

    const finalText = await storage.readJob("same-job");
    expect(finalText).not.toBeNull();
    expect(values).toContain(finalText);
    expect(() => JSON.parse(finalText!)).not.toThrow();

    const jobDir = path.join(root, "jobs");
    const files = await readdir(jobDir);
    expect(files).toEqual(["same-job.json"]);
    expect(await readFile(path.join(jobDir, "same-job.json"), "utf8")).toBe(finalText);
  });
});
