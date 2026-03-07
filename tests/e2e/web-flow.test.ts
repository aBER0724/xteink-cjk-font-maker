import { describe, expect, it } from "vitest";
import { runWebFlow } from "../../web/app";

describe("web flow", () => {
  it("uploads a font, submits job, and shows download when done", async () => {
    const calls: string[] = [];
    let jobBody: { font_weight?: number } | null = null;

    const apiRequest = async (path: string, init?: RequestInit): Promise<unknown> => {
      calls.push(path);

      if (path === "/api/upload-url") {
        return {
          upload_url: "https://example.com/r2/uploads/sample.ttf",
          object_key: "uploads/sample.ttf",
        };
      }

      if (path === "/api/jobs") {
        jobBody = JSON.parse(String(init?.body ?? "{}")) as { font_weight?: number };
        return { job_id: "job-1" };
      }

      if (path === "/api/jobs/job-1") {
        return { job_id: "job-1", status: "done" };
      }

      if (path === "/api/jobs/job-1/download") {
        return {
          job_id: "job-1",
          download_url: "/api/jobs/job-1/download/file",
          output_name: "Yozai-Medium_28_33x39.bin",
        };
      }

      throw new Error(`unexpected path: ${path}`);
    };

    const result = await runWebFlow(
      {
        fileName: "sample.ttf",
        tier: "6k",
        fontSizePx: 28,
        fontWeight: 700,
        outputWidthPx: 33,
        outputHeightPx: 39,
      },
      apiRequest
    );

    expect(result.downloadUrl).toBe("/api/jobs/job-1/download/file");
    expect(result.outputName).toBe("Yozai-Medium_28_33x39.bin");
    expect(calls).toEqual([
      "/api/upload-url",
      "/api/jobs",
      "/api/jobs/job-1",
      "/api/jobs/job-1/download",
    ]);
    expect(jobBody?.font_weight).toBe(700);
  });

  it("emits progress updates during conversion flow", async () => {
    const progressEvents: Array<{ phase: string; percent: number }> = [];
    let statusChecks = 0;

    const apiRequest = async (path: string, init?: RequestInit): Promise<unknown> => {
      if (path === "/api/upload-url") {
        return {
          upload_url: "https://example.com/r2/uploads/sample.ttf",
          object_key: "uploads/sample.ttf",
        };
      }

      if (path === "/api/jobs") {
        return { job_id: "job-2" };
      }

      if (path === "/api/jobs/job-2") {
        statusChecks += 1;
        if (statusChecks === 1) {
          return {
            job_id: "job-2",
            status: "processing",
            progress: { phase: "measuring", percent: 5, done: 10, total: 100 },
          };
        }
        if (statusChecks === 2) {
          return {
            job_id: "job-2",
            status: "processing",
            progress: { phase: "rendering", percent: 70, done: 80, total: 100 },
          };
        }
        return {
          job_id: "job-2",
          status: "done",
          progress: { phase: "done", percent: 100, done: 100, total: 100 },
        };
      }

      if (path === "/api/jobs/job-2/download") {
        return {
          job_id: "job-2",
          download_url: "/api/jobs/job-2/download/file",
          output_name: "悠哉字体-Medium_28_33x39.bin",
        };
      }

      throw new Error(`unexpected path: ${path}`);
    };

    await runWebFlow(
      {
        fileName: "sample.ttf",
        tier: "65k",
        fontSizePx: 28,
        fontWeight: 400,
        outputWidthPx: 33,
        outputHeightPx: 39,
      },
      apiRequest,
      async () => undefined,
      (event: { phase: string; percent: number }) => progressEvents.push(event)
    );

    expect(progressEvents.some((event) => event.phase === "measuring" && event.percent > 0 && event.percent < 100)).toBe(true);
    expect(progressEvents.some((event) => event.phase === "rendering" && event.percent > 0 && event.percent < 100)).toBe(true);
    for (let i = 1; i < progressEvents.length; i += 1) {
      expect(progressEvents[i].percent).toBeGreaterThanOrEqual(progressEvents[i - 1].percent);
    }
    expect(progressEvents.at(-1)).toEqual({ phase: "done", percent: 100 });
  });

  it("keeps displayed progress monotonic when polled percent goes backward", async () => {
    const progressEvents: Array<{ phase: string; percent: number }> = [];
    let statusChecks = 0;

    const apiRequest = async (path: string): Promise<unknown> => {
      if (path === "/api/upload-url") {
        return {
          upload_url: "https://example.com/r2/uploads/sample.ttf",
          object_key: "uploads/sample.ttf",
        };
      }
      if (path === "/api/jobs") {
        return { job_id: "job-3" };
      }
      if (path === "/api/jobs/job-3") {
        statusChecks += 1;
        if (statusChecks === 1) {
          return {
            job_id: "job-3",
            status: "processing",
            progress: { phase: "measuring", percent: 40, done: 40, total: 100 },
          };
        }
        if (statusChecks === 2) {
          return {
            job_id: "job-3",
            status: "processing",
            progress: { phase: "rendering", percent: 20, done: 20, total: 100 },
          };
        }
        return {
          job_id: "job-3",
          status: "done",
          progress: { phase: "done", percent: 100, done: 100, total: 100 },
        };
      }
      if (path === "/api/jobs/job-3/download") {
        return {
          job_id: "job-3",
          download_url: "/api/jobs/job-3/download/file",
          output_name: "sample.bin",
        };
      }
      throw new Error(`unexpected path: ${path}`);
    };

    await runWebFlow(
      {
        fileName: "sample.ttf",
        tier: "6k",
        fontSizePx: 28,
        outputWidthPx: 33,
        outputHeightPx: 39,
      },
      apiRequest,
      async () => undefined,
      (event: { phase: string; percent: number }) => progressEvents.push(event)
    );

    expect(progressEvents.some((event) => event.phase === "rendering" && event.percent === 40)).toBe(true);
    expect(progressEvents.at(-1)).toEqual({ phase: "done", percent: 100 });
  });
});
