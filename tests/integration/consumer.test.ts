import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processOneJob } from "../../worker/src/consumer";
import { createFileSystemStorage, createMemoryStorage } from "../../worker/src/storage";
import * as converterModule from "../../worker/src/converter";
import { buildTestFontBytes } from "../helpers/font-fixture";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir() {
  const dir = await mkdtemp(`${tmpdir()}/xteink-consumer-`);
  tempDirs.push(dir);
  return dir;
}

describe("processOneJob", () => {
  it("processes a queued job in-process and exposes download metadata", async () => {
    const storage = createMemoryStorage();
    await storage.writeUpload("uploads/sample.ttf", buildTestFontBytes());
    await storage.writeJob(
      "job-1",
      JSON.stringify({
        job_id: "job-1",
        status: "queued",
        request: {
          font_object_key: "uploads/sample.ttf",
          tier: "6k",
          font_size_px: 28,
          output_width_px: 33,
          output_height_px: 39,
          font_name: "Sample Font.ttf",
        },
      })
    );

    const result = await processOneJob(
      {
        job_id: "job-1",
        font_object_key: "uploads/sample.ttf",
        tier: "6k",
        font_size_px: 28,
        output_width_px: 33,
        output_height_px: 39,
        font_name: "Sample Font.ttf",
      },
      {
        storage,
      }
    );

    expect(result.status).toBe("done");
    expect(result.output_key).toBe("outputs/job-1.bin");
    expect(result.output_name).toBe("Sample Font_28_33x39.bin");

    const output = await storage.readOutput("outputs/job-1.bin");
    expect(output).not.toBeNull();

    const jobStateText = await storage.readJob("job-1");
    expect(jobStateText).not.toBeNull();
    expect(JSON.parse(jobStateText as string)).toMatchObject({
      job_id: "job-1",
      status: "done",
      output_key: "outputs/job-1.bin",
      output_name: "Sample Font_28_33x39.bin",
    });
  });

  it("owns failed status transitions when processing throws", async () => {
    const storage = createMemoryStorage();
    await storage.writeJob(
      "job-fail",
      JSON.stringify({
        job_id: "job-fail",
        status: "queued",
        request: {
          font_object_key: "uploads/missing.ttf",
          tier: "6k",
          font_size_px: 28,
          output_width_px: 33,
          output_height_px: 39,
        },
      })
    );

    await expect(
      processOneJob(
        {
          job_id: "job-fail",
          font_object_key: "uploads/missing.ttf",
          tier: "6k",
          font_size_px: 28,
          output_width_px: 33,
          output_height_px: 39,
        },
        { storage }
      )
    ).rejects.toThrow("missing font object: uploads/missing.ttf");

    const jobStateText = await storage.readJob("job-fail");
    expect(jobStateText).not.toBeNull();
    expect(JSON.parse(jobStateText as string)).toMatchObject({
      job_id: "job-fail",
      status: "failed",
      error_message: "missing font object: uploads/missing.ttf",
    });
  });

  it("allows only one concurrent filesystem claimant to process a queued job", async () => {
    const storageRoot = await createTempDir();
    const storage = createFileSystemStorage(storageRoot);
    const fontBytes = buildTestFontBytes();
    await storage.writeUpload("uploads/sample.ttf", fontBytes);
    await storage.writeJob(
      "job-race",
      JSON.stringify({
        job_id: "job-race",
        status: "queued",
        request: {
          font_object_key: "uploads/sample.ttf",
          tier: "6k",
          font_size_px: 28,
          output_width_px: 33,
          output_height_px: 39,
          font_name: "Sample Font.ttf",
        },
      })
    );

    const convertSpy = vi.spyOn(converterModule, "convertFontToBin").mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        data: new Uint8Array(input.fontData),
      };
    });

    const job = {
      job_id: "job-race",
      font_object_key: "uploads/sample.ttf",
      tier: "6k" as const,
      font_size_px: 28,
      output_width_px: 33,
      output_height_px: 39,
      font_name: "Sample Font.ttf",
    };

    const [first, second] = await Promise.allSettled([
      processOneJob(job, { storage }),
      processOneJob(job, { storage }),
    ]);

    const fulfilled = [first, second].filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof processOneJob>>> => result.status === "fulfilled");
    const rejected = [first, second].filter((result): result is PromiseRejectedResult => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value).toMatchObject({
      status: "done",
      output_key: "outputs/job-race.bin",
      output_name: "Sample Font_28_33x39.bin",
    });
    expect(rejected[0].reason).toBeInstanceOf(Error);
    expect((rejected[0].reason as Error).message).toBe("job is not claimable: job-race");
    expect(convertSpy).toHaveBeenCalledTimes(1);

    const jobStateText = await storage.readJob("job-race");
    expect(jobStateText).not.toBeNull();
    expect(JSON.parse(jobStateText as string)).toMatchObject({
      job_id: "job-race",
      status: "done",
      output_key: "outputs/job-race.bin",
      output_name: "Sample Font_28_33x39.bin",
    });
  });
});
