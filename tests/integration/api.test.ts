import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../worker/src/storage";
import type { CpfontCapability } from "../../worker/src/cpfont/types";
import { handleApiData } from "../../worker/src/api";
import { buildTestFontBytes } from "../helpers/font-fixture";

function createRequest(path: string, init?: RequestInit) {
  const request = new Request(`https://example.com${path}`, init);
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: init?.body ? new Uint8Array(request.arrayBuffer ? [] : []) : undefined,
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const req = new Request(`https://example.com${path}`, init);
  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await req.arrayBuffer());
  return handleApiData(
    {
      method,
      url: req.url,
      headers: req.headers,
      body,
    },
    {
      storage: createMemoryStorage(),
    }
  );
}

async function uploadFixture(name = "sample.ttf"): Promise<{ objectKey: string; storage: ReturnType<typeof createMemoryStorage> }> {
  const storage = createMemoryStorage();
  const uploadRes = await handleApiData(
    {
      method: "POST",
      url: "https://example.com/api/upload-url",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify({ file_name: name })),
    },
    { storage }
  );
  const uploadMeta = await uploadRes.json();
  const bytes = buildTestFontBytes();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const putRes = await handleApiData(
    {
      method: "PUT",
      url: `https://example.com${uploadMeta.upload_url as string}`,
      body: new Uint8Array(body),
    },
    { storage }
  );
  expect(putRes.status).toBe(200);

  return {
    objectKey: uploadMeta.object_key as string,
    storage,
  };
}

async function createJob(objectKey: string, storage: ReturnType<typeof createMemoryStorage>): Promise<string> {
  const res = await handleApiData(
    {
      method: "POST",
      url: "https://example.com/api/jobs",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify({
        font_object_key: objectKey,
        tier: "6k",
        font_size_px: 28,
        font_weight: 700,
        output_width_px: 33,
        output_height_px: 39,
        font_name: "Yozai-Medium.ttf",
      })),
    },
    { storage }
  );
  expect(res.status).toBe(202);
  return (await res.json()).job_id as string;
}

async function getJobState(jobId: string, storage: ReturnType<typeof createMemoryStorage>): Promise<Response> {
  return handleApiData(
    {
      method: "GET",
      url: `https://example.com/api/jobs/${jobId}`,
    },
    { storage }
  );
}

describe("api routes", () => {
  it("returns upload url and object key", async () => {
    const storage = createMemoryStorage();
    const res = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/upload-url",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({ file_name: "sample.ttf" })),
      },
      { storage }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upload_url).toBeTruthy();
    expect(body.upload_url).toContain("/api/uploads?object_key=");
    expect(body.object_key).toContain("uploads/");
  });

  it("accepts binary upload via query upload url using POST", async () => {
    const storage = createMemoryStorage();
    const uploadRes = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/upload-url",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({ file_name: "sample.ttf" })),
      },
      { storage }
    );
    expect(uploadRes.status).toBe(200);
    const uploadMeta = await uploadRes.json();

    const bytes = buildTestFontBytes();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const postRes = await handleApiData(
      {
        method: "POST",
        url: `https://example.com${uploadMeta.upload_url as string}`,
        body: new Uint8Array(body),
      },
      { storage }
    );
    expect(postRes.status).toBe(200);

    const jobId = await createJob(uploadMeta.object_key as string, storage);
    const stateRes = await getJobState(jobId, storage);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();
    expect(state.status).toBe("queued");
  });

  it("creates a job and returns job_id", async () => {
    const { objectKey, storage } = await uploadFixture();
    const jobId = await createJob(objectKey, storage);
    expect(jobId).toBeTruthy();
  });

  it("gets queued job status by id", async () => {
    const { objectKey, storage } = await uploadFixture();
    const jobId = await createJob(objectKey, storage);

    const bodyRes = await getJobState(jobId, storage);
    expect(bodyRes.status).toBe(200);
    const body = await bodyRes.json();
    expect(body.job_id).toBe(jobId);
    expect(body.status).toBe("queued");
    expect(body.request.font_weight).toBe(700);
    expect(body.request.output_format).toBeUndefined();
  });

  it("accepts cpfont-v4 jobs with a safe family name", async () => {
    const { objectKey, storage } = await uploadFixture();
    const res = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/jobs",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({
          font_object_key: objectKey,
          output_format: "cpfont-v4",
          family_name: "ExampleCJK",
          force_autohint: true,
          font_name: "Example CJK.ttf",
        })),
      },
      {
        storage,
        cpfontCapability: { available: true, version: 4, sizes: [8, 10, 12, 14, 16, 18, 22], root: "toolkit" },
      }
    );

    expect(res.status).toBe(202);
    const jobId = (await res.json()).job_id as string;
    const state = await getJobState(jobId, storage);
    await expect(state.json()).resolves.toMatchObject({
      request: {
        output_format: "cpfont-v4",
        family_name: "ExampleCJK",
        force_autohint: true,
      },
    });
  });

  it("rejects unsafe cpfont family names and unavailable toolkits", async () => {
    const { objectKey, storage } = await uploadFixture();
    const makeRequest = (familyName: string, capability: CpfontCapability) => handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/jobs",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({
          font_object_key: objectKey,
          output_format: "cpfont-v4",
          family_name: familyName,
        })),
      },
      { storage, cpfontCapability: capability }
    );

    const unsafe = await makeRequest("../bad", { available: true, version: 4, sizes: [8, 10, 12, 14, 16, 18, 22], root: "toolkit" });
    expect(unsafe.status).toBe(400);
    await expect(unsafe.json()).resolves.toEqual({ code: "ERR_INVALID_FAMILY_NAME" });

    const unavailable = await makeRequest("ExampleCJK", { available: false, version: 4, sizes: [8, 10, 12, 14, 16, 18, 22], reason: "ERR_CPFONT_TOOL_MISSING" });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ code: "ERR_CPFONT_TOOL_MISSING" });
  });

  it("reports public conversion capabilities", async () => {
    const storage = createMemoryStorage();
    const response = await handleApiData(
      { method: "GET", url: "https://example.com/api/capabilities" },
      { storage, cpfontCapability: { available: true, version: 4, sizes: [8, 10, 12, 14, 16, 18, 22], root: "C:/private/toolkit" } }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      cpfont: { available: true, version: 4, sizes: [8, 10, 12, 14, 16, 18, 22] },
      legacyFormats: ["legacy-bin", "xbf2"],
    });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("persists requested output format on queued jobs", async () => {
    const { objectKey, storage } = await uploadFixture();
    const res = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/jobs",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({
          font_object_key: objectKey,
          tier: "6k",
          font_size_px: 28,
          font_weight: 700,
          output_width_px: 33,
          output_height_px: 39,
          output_format: "xbf2",
          font_name: "Yozai-Medium.ttf",
        })),
      },
      { storage }
    );
    expect(res.status).toBe(202);
    const jobId = (await res.json()).job_id as string;

    const bodyRes = await getJobState(jobId, storage);
    expect(bodyRes.status).toBe(200);
    const body = await bodyRes.json();
    expect(body.request.output_format).toBe("xbf2");
  });

  it("rejects unknown output formats when creating jobs", async () => {
    const { objectKey, storage } = await uploadFixture();
    const res = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/jobs",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({
          font_object_key: objectKey,
          tier: "6k",
          font_size_px: 28,
          font_weight: 700,
          output_width_px: 33,
          output_height_px: 39,
          output_format: "foo",
          font_name: "Yozai-Medium.ttf",
        })),
      },
      { storage }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ code: "ERR_INVALID_OUTPUT_FORMAT" });
  });

  it("serves completed cpfont packages with ZIP MIME and UTF-8-safe names", async () => {
    const storage = createMemoryStorage();
    await storage.writeOutput("outputs/job-zip.zip", new Uint8Array([0x50, 0x4b]));
    await storage.writeJob("job-zip", JSON.stringify({
      job_id: "job-zip", status: "done", output_key: "outputs/job-zip.zip", output_name: "示例_cpfont-v4.zip",
    }));

    const response = await handleApiData(
      { method: "GET", url: "https://example.com/api/jobs/job-zip/download/file" },
      { storage },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''");
  });

  it("returns job not ready for download metadata before processing", async () => {
    const { objectKey, storage } = await uploadFixture();
    const jobId = await createJob(objectKey, storage);

    const res = await handleApiData(
      {
        method: "GET",
        url: `https://example.com/api/jobs/${jobId}/download`,
      },
      { storage }
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ code: "ERR_JOB_NOT_READY" });
  });

  it("accepts utf-8 font names when creating queued jobs", async () => {
    const { objectKey: key, storage } = await uploadFixture("悠哉字体-Medium.ttf");
    const res = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/jobs",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({
          font_object_key: key,
          tier: "6k",
          font_size_px: 28,
          font_weight: 700,
          output_width_px: 33,
          output_height_px: 39,
          font_name: "悠哉字体-Medium.ttf",
        })),
      },
      { storage }
    );
    expect(res.status).toBe(202);
    const jobId = (await res.json()).job_id as string;

    const bodyRes = await getJobState(jobId, storage);
    expect(bodyRes.status).toBe(200);
    const body = await bodyRes.json();
    expect(body.status).toBe("queued");
    expect(body.request.font_name).toBe("悠哉字体-Medium.ttf");
  });

  it("keeps returning the last valid job state when storage reads transiently fail", async () => {
    const baseStorage = createMemoryStorage();
    const uploadRes = await handleApiData(
      {
        method: "POST",
        url: "https://example.com/api/upload-url",
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(JSON.stringify({ file_name: "sample.ttf" })),
      },
      { storage: baseStorage }
    );
    expect(uploadRes.status).toBe(200);
    const uploadMeta = await uploadRes.json();
    const bytes = buildTestFontBytes();
    const uploadBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const putRes = await handleApiData(
      {
        method: "PUT",
        url: `https://example.com${uploadMeta.upload_url as string}`,
        body: new Uint8Array(uploadBody),
      },
      { storage: baseStorage }
    );
    expect(putRes.status).toBe(200);
    const jobId = await createJob(uploadMeta.object_key as string, baseStorage);

    let readCount = 0;
    const storage = {
      ...baseStorage,
      async readJob(currentJobId: string) {
        const raw = await baseStorage.readJob(currentJobId);
        if (currentJobId === jobId) {
          readCount += 1;
          if (readCount === 2) {
            return null;
          }
          if (readCount === 3) {
            return "{";
          }
        }
        return raw;
      },
    };

    const first = await getJobState(jobId, storage);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      job_id: jobId,
      status: "queued",
    });

    const second = await getJobState(jobId, storage);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      job_id: jobId,
      status: "queued",
    });

    const third = await getJobState(jobId, storage);
    expect(third.status).toBe(200);
    await expect(third.json()).resolves.toMatchObject({
      job_id: jobId,
      status: "queued",
    });
  });

  it("returns not found for missing jobs", async () => {
    const storage = createMemoryStorage();
    const response = await getJobState("job-missing", storage);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: "ERR_JOB_NOT_FOUND" });
  });
});
