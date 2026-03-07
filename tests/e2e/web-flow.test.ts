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
        if (statusChecks < 2) {
          return {
            job_id: "job-2",
            status: "queued",
            progress: { phase: "measuring", percent: 1, done: 10, total: 100 },
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

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.some((event) => event.percent > 0)).toBe(true);
    expect(progressEvents.at(-1)?.phase).toBe("done");
    expect(progressEvents.at(-1)?.percent).toBe(100);
  });
});
