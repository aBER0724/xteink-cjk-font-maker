import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processOneJob } from "../../worker/src/consumer";
import { createFileSystemStorage, createMemoryStorage } from "../../worker/src/storage";
import * as converterModule from "../../worker/src/converter";
import type { ConvertOutput } from "../../worker/src/converter";
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

  it("persists real measuring and rendering progress while processing a queued job", async () => {
    const storage = createMemoryStorage();
    await storage.writeUpload("uploads/sample.ttf", buildTestFontBytes());
    await storage.writeJob(
      "job-progress",
      JSON.stringify({
        job_id: "job-progress",
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

    const writeJobSpy = vi.spyOn(storage, "writeJob");
    const convertSpy = vi.spyOn(converterModule, "convertFontToBin").mockImplementation(
      async (_input, onProgress): Promise<ConvertOutput> => {
        onProgress?.({
          phase: "measuring",
          percent: 15,
          done: 1,
          total: 8,
        });
        onProgress?.({
          phase: "measuring",
          percent: 15,
          done: 1,
          total: 8,
        });
        onProgress?.({
          phase: "rendering",
          percent: 72,
          done: 6,
          total: 8,
        });
        onProgress?.({
          phase: "rendering",
          percent: 72,
          done: 6,
          total: 8,
        });

        return {
          data: new Uint8Array([1, 2, 3]),
          width: 33,
          height: 39,
          bytesPerGlyph: 195,
        };
      }
    );

    const result = await processOneJob(
      {
        job_id: "job-progress",
        font_object_key: "uploads/sample.ttf",
        tier: "6k",
        font_size_px: 28,
        output_width_px: 33,
        output_height_px: 39,
        font_name: "Sample Font.ttf",
      },
      { storage }
    );

    expect(result).toMatchObject({
      status: "done",
      output_key: "outputs/job-progress.bin",
      output_name: "Sample Font_28_33x39.bin",
    });
    expect(convertSpy).toHaveBeenCalledTimes(1);

    const persistedStates = writeJobSpy.mock.calls
      .filter(([jobId]) => jobId === "job-progress")
      .map(([, value]) => JSON.parse(value));

    const intermediateProgressStates = persistedStates.filter(
      (state) =>
        state.status === "processing" &&
        state.progress &&
        state.progress.percent > 0 &&
        state.progress.percent < 100 &&
        (state.progress.phase === "measuring" || state.progress.phase === "rendering")
    );

    expect(intermediateProgressStates).toEqual([
      expect.objectContaining({
        progress: {
          phase: "measuring",
          percent: 15,
          done: 1,
          total: 8,
        },
      }),
      expect.objectContaining({
        progress: {
          phase: "rendering",
          percent: 72,
          done: 6,
          total: 8,
        },
      }),
    ]);

    const finalState = persistedStates.at(-1);
    expect(finalState).toMatchObject({
      job_id: "job-progress",
      status: "done",
      output_key: "outputs/job-progress.bin",
      output_name: "Sample Font_28_33x39.bin",
      progress: {
        phase: "done",
        percent: 100,
        done: 1,
        total: 1,
      },
    });
  });

  it("keeps failed state stable when queued progress persistence completes after conversion throws", async () => {
    const storage = createMemoryStorage();
    await storage.writeUpload("uploads/sample.ttf", buildTestFontBytes());
    await storage.writeJob(
      "job-progress-fail",
      JSON.stringify({
        job_id: "job-progress-fail",
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

    const releaseProgressWrite = Promise.withResolvers<void>();
    const originalWriteJob = storage.writeJob.bind(storage);
    const writeJobSpy = vi.spyOn(storage, "writeJob").mockImplementation(async (jobId, value) => {
      const state = JSON.parse(value);
      if (jobId === "job-progress-fail" && state.status === "processing" && state.progress?.phase === "rendering") {
        await releaseProgressWrite.promise;
      }
      await originalWriteJob(jobId, value);
    });

    vi.spyOn(converterModule, "convertFontToBin").mockImplementation(async (_input, onProgress): Promise<ConvertOutput> => {
      onProgress?.({
        phase: "rendering",
        percent: 72,
        done: 6,
        total: 8,
      });
      throw new Error("conversion exploded");
    });

    const jobPromise = processOneJob(
      {
        job_id: "job-progress-fail",
        font_object_key: "uploads/sample.ttf",
        tier: "6k",
        font_size_px: 28,
        output_width_px: 33,
        output_height_px: 39,
        font_name: "Sample Font.ttf",
      },
      { storage }
    );

    await Promise.resolve();
    releaseProgressWrite.resolve();

    await expect(jobPromise).rejects.toThrow("conversion exploded");

    const writesForJob = writeJobSpy.mock.calls
      .filter(([jobId]) => jobId === "job-progress-fail")
      .map(([, value]) => JSON.parse(value));

    expect(writesForJob).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "processing",
          progress: {
            phase: "rendering",
            percent: 72,
            done: 6,
            total: 8,
          },
        }),
        expect.objectContaining({
          status: "failed",
          error_message: "conversion exploded",
          progress: {
            phase: "failed",
            percent: 100,
            done: 1,
            total: 1,
          },
        }),
      ])
    );

    const jobStateText = await storage.readJob("job-progress-fail");
    expect(jobStateText).not.toBeNull();
    expect(JSON.parse(jobStateText as string)).toMatchObject({
      job_id: "job-progress-fail",
      status: "failed",
      error_message: "conversion exploded",
      progress: {
        phase: "failed",
        percent: 100,
        done: 1,
        total: 1,
      },
    });
  });

  it("marks the job failed and releases the claim when progress persistence throws", async () => {
    const storage = createMemoryStorage();
    await storage.writeUpload("uploads/sample.ttf", buildTestFontBytes());
    await storage.writeJob(
      "job-progress-write-fail",
      JSON.stringify({
        job_id: "job-progress-write-fail",
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

    const originalWriteJob = storage.writeJob.bind(storage);
    const releaseJobClaimSpy = vi.spyOn(storage, "releaseJobClaim");
    let failedProgressWrite = false;
    vi.spyOn(storage, "writeJob").mockImplementation(async (jobId, value) => {
      const state = JSON.parse(value);
      if (
        !failedProgressWrite &&
        jobId === "job-progress-write-fail" &&
        state.status === "processing" &&
        state.progress?.phase === "rendering"
      ) {
        failedProgressWrite = true;
        throw new Error("progress persistence exploded");
      }
      await originalWriteJob(jobId, value);
    });

    vi.spyOn(converterModule, "convertFontToBin").mockImplementation(async (_input, onProgress): Promise<ConvertOutput> => {
      onProgress?.({
        phase: "rendering",
        percent: 72,
        done: 6,
        total: 8,
      });
      return {
        data: new Uint8Array([1, 2, 3]),
        width: 33,
        height: 39,
        bytesPerGlyph: 195,
      };
    });

    await expect(
      processOneJob(
        {
          job_id: "job-progress-write-fail",
          font_object_key: "uploads/sample.ttf",
          tier: "6k",
          font_size_px: 28,
          output_width_px: 33,
          output_height_px: 39,
          font_name: "Sample Font.ttf",
        },
        { storage }
      )
    ).rejects.toThrow("progress persistence exploded");

    expect(releaseJobClaimSpy).toHaveBeenCalledWith("job-progress-write-fail");
    const jobStateText = await storage.readJob("job-progress-write-fail");
    expect(jobStateText).not.toBeNull();
    expect(JSON.parse(jobStateText as string)).toMatchObject({
      job_id: "job-progress-write-fail",
      status: "failed",
      error_message: "progress persistence exploded",
      progress: {
        phase: "failed",
        percent: 100,
        done: 1,
        total: 1,
      },
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
