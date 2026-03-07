import { afterEach, describe, expect, it, vi } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createServer, resolvePort } from "../../server/index";
import * as consumerModule from "../../worker/src/consumer";
import { buildTestFontBytes } from "../helpers/font-fixture";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function createTempDir() {
  const dir = await mkdtemp(`${tmpdir()}/xteink-node-api-`);
  tempDirs.push(dir);
  return dir;
}

async function request(path: string, init?: RequestInit, options?: { storageRoot?: string }) {
  const server = createServer(options);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;

  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, init);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function waitForJobDone(fetchFromServer: (path: string, init?: RequestInit) => Promise<Response>, jobId: string) {
  let sawExistingJob = false;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const statusResponse = await fetchFromServer(`/api/jobs/${jobId}`);
    if (statusResponse.status === 404 && !sawExistingJob) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }

    expect(statusResponse.status).toBe(200);
    sawExistingJob = true;
    const status = await statusResponse.json();
    if ((status as { status?: string }).status === "done") {
      return status;
    }
    if ((status as { status?: string }).status === "failed") {
      throw new Error(`job failed: ${JSON.stringify(status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`job did not complete in time: ${jobId}`);
}

describe("node api server", () => {
  it("returns ok for GET /api/health", async () => {
    const response = await request("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("processes a queued job in-process and exposes download metadata via the Node server", async () => {
    const storageRoot = await createTempDir();
    const server = createServer({ storageRoot });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const { port } = server.address() as AddressInfo;
    const fetchFromServer = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init);

    try {
      const uploadMetaResponse = await fetchFromServer("/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_name: "font.ttf" }),
      });
      expect(uploadMetaResponse.status).toBe(200);
      const uploadMeta = await uploadMetaResponse.json();

      const fontBytes = buildTestFontBytes();
      const uploadBody = fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength) as ArrayBuffer;
      const uploadResponse = await fetchFromServer(uploadMeta.upload_url as string, {
        method: "PUT",
        body: uploadBody,
      });
      expect(uploadResponse.status).toBe(200);

      const createJobResponse = await fetchFromServer("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          font_object_key: uploadMeta.object_key,
          tier: "24k",
          font_size_px: 24,
          font_weight: 400,
          output_width_px: 24,
          output_height_px: 28,
          compat_flip_y: false,
          font_name: "font.ttf",
        }),
      });

      expect(createJobResponse.status).toBe(202);
      const created = await createJobResponse.json();
      expect(created).toMatchObject({
        job_id: expect.any(String),
      });

      const uploadedBytes = await readFile(`${storageRoot}/${uploadMeta.object_key}`);
      expect(uploadedBytes.byteLength).toBeGreaterThan(0);

      await expect(access(`${storageRoot}/uploads/${uploadMeta.object_key}`)).rejects.toBeTruthy();

      const finalStatus = await waitForJobDone(fetchFromServer, created.job_id);

      expect(finalStatus).toMatchObject({
        job_id: created.job_id,
        status: "done",
        output_key: `outputs/${created.job_id}.bin`,
        output_name: "font_24_24x28.bin",
      });

      const persistedState = JSON.parse(await readFile(`${storageRoot}/jobs/${created.job_id}.json`, "utf8"));
      expect(persistedState).toMatchObject({
        job_id: created.job_id,
        status: "done",
        output_key: `outputs/${created.job_id}.bin`,
        output_name: "font_24_24x28.bin",
      });

      const outputBytes = await readFile(`${storageRoot}/outputs/${created.job_id}.bin`);
      expect(outputBytes.byteLength).toBeGreaterThan(0);

      const downloadResponse = await fetchFromServer(`/api/jobs/${created.job_id}/download`);
      expect(downloadResponse.status).toBe(200);
      await expect(downloadResponse.json()).resolves.toEqual({
        job_id: created.job_id,
        download_url: `/api/jobs/${created.job_id}/download/file`,
        output_name: "font_24_24x28.bin",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("does not re-schedule the same queued job on repeated status queries", async () => {
    const storageRoot = await createTempDir();
    const originalProcessOneJob = consumerModule.processOneJob;
    const processSpy = vi.spyOn(consumerModule, "processOneJob").mockImplementation(async (job, env) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return originalProcessOneJob(job, env);
    });

    const server = createServer({ storageRoot });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const { port } = server.address() as AddressInfo;
    const fetchFromServer = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init);

    try {
      const uploadMetaResponse = await fetchFromServer("/api/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_name: "font.ttf" }),
      });
      const uploadMeta = await uploadMetaResponse.json();
      const fontBytes = buildTestFontBytes();
      await fetchFromServer(uploadMeta.upload_url as string, {
        method: "PUT",
        body: fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength) as ArrayBuffer,
      });

      const createJobResponse = await fetchFromServer("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          font_object_key: uploadMeta.object_key,
          tier: "24k",
          font_size_px: 24,
          output_width_px: 24,
          output_height_px: 28,
          font_name: "font.ttf",
        }),
      });
      const created = await createJobResponse.json();

      const statusResponses = await Promise.all([
        fetchFromServer(`/api/jobs/${created.job_id}`),
        fetchFromServer(`/api/jobs/${created.job_id}`),
        fetchFromServer(`/api/jobs/${created.job_id}`),
      ]);
      for (const statusResponse of statusResponses) {
        expect(statusResponse.status).toBe(200);
      }

      await waitForJobDone(fetchFromServer, created.job_id);
      expect(processSpy).toHaveBeenCalledTimes(1);
    } finally {
      processSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("returns not found for missing jobs via the Node server", async () => {
    const storageRoot = await createTempDir();
    const response = await request("/api/jobs/job-missing", undefined, { storageRoot });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: "ERR_JOB_NOT_FOUND" });
  });

  it("maps upload and output keys directly under the storage root", async () => {
    const storageRoot = await createTempDir();
    const uploadMetaResponse = await request(
      "/api/upload-url",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_name: "font.ttf" }),
      },
      { storageRoot }
    );
    const uploadMeta = await uploadMetaResponse.json();

    const fontBytes = buildTestFontBytes();
    const uploadBody = fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength) as ArrayBuffer;
    const uploadResponse = await request(
      uploadMeta.upload_url as string,
      {
        method: "PUT",
        body: uploadBody,
      },
      { storageRoot }
    );
    expect(uploadResponse.status).toBe(200);

    const storedUpload = await readFile(`${storageRoot}/${uploadMeta.object_key}`);
    expect(storedUpload.byteLength).toBe(fontBytes.byteLength);
  });

  it("returns 404 json for missing asset-like routes", async () => {
    const response = await request("/missing.js");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("falls back to default port for invalid PORT values", () => {
    expect(resolvePort(undefined)).toBe(3000);
    expect(resolvePort("not-a-port")).toBe(3000);
    expect(resolvePort("70000")).toBe(3000);
  });
});
