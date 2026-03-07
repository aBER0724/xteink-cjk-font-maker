import { createMemoryStorage, type AppStorage } from "./storage.js";

interface JobRequestPayload {
  font_object_key: string;
  tier: "6k" | "24k" | "65k";
  font_size_px: number;
  font_weight?: number;
  letter_spacing_px?: number;
  line_spacing_px?: number;
  output_width_px?: number;
  output_height_px?: number;
  compat_flip_y?: boolean;
  font_name?: string;
}

interface JobState {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  output_key?: string;
  output_name?: string;
  error_message?: string;
  progress?: {
    phase: string;
    percent: number;
    done: number;
    total: number;
  };
  request?: JobRequestPayload;
}

interface ApiRequest {
  method: string;
  url: string;
  headers?: HeadersInit;
  body?: Uint8Array;
}

export interface ApiHandlerOptions {
  storage: AppStorage;
}

const fallbackStorage = createMemoryStorage();

async function loadJobState(jobId: string, storage: AppStorage): Promise<JobState | null> {
  const raw = await storage.readJob(jobId);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as JobState;
  } catch {
    return null;
  }
}

async function saveJobStateInternal(state: JobState, storage: AppStorage): Promise<void> {
  await storage.writeJob(state.job_id, JSON.stringify(state));
}

async function loadUploadObject(objectKey: string, storage: AppStorage): Promise<Uint8Array | null> {
  return storage.readUpload(objectKey);
}

async function saveUploadObject(objectKey: string, data: Uint8Array, storage: AppStorage): Promise<void> {
  await storage.writeUpload(objectKey, data);
}

async function loadOutputObject(objectKey: string, storage: AppStorage): Promise<Uint8Array | null> {
  return storage.readOutput(objectKey);
}

async function saveOutputObject(objectKey: string, data: Uint8Array, storage: AppStorage): Promise<void> {
  await storage.writeOutput(objectKey, data);
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
    },
  });
}

function toAsciiFilename(filename: string): string {
  const normalized = filename.normalize("NFKD").replace(/[^\x20-\x7E]/g, "_");
  const collapsed = normalized.replace(/_+/g, "_").trim();
  return collapsed || "download.bin";
}

function buildContentDisposition(filename: string): string {
  const asciiFallback = toAsciiFilename(filename).replace(/"/g, "");
  const utf8Encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

function binary(data: Uint8Array, filename: string): Response {
  const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": buildContentDisposition(filename),
      ...corsHeaders(),
    },
  });
}

function nextJobId(): string {
  return `job-${Math.random().toString(36).slice(2, 10)}`;
}

function nextObjectKey(fileName = "upload.ttf"): string {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : ".ttf";
  return `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

async function parseJsonBody<T>(body: Uint8Array | undefined, fallback: T): Promise<T> {
  if (!body || body.byteLength === 0) {
    return fallback;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as T;
  } catch {
    return fallback;
  }
}

export async function handleApiData(request: ApiRequest, options: ApiHandlerOptions): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const storage = options.storage;

  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === "POST" && pathname === "/api/upload-url") {
    const body = await parseJsonBody<{ file_name?: string }>(request.body, {});
    const objectKey = nextObjectKey(body.file_name);
    return json({
      upload_url: `/api/uploads?object_key=${encodeURIComponent(objectKey)}`,
      object_key: objectKey,
    });
  }

  const uploadMatch = pathname.match(/^\/api\/uploads\/(.+)$/);
  if ((request.method === "PUT" || request.method === "POST") && (uploadMatch || pathname === "/api/uploads" || pathname === "/api/uploads/")) {
    const objectKeyRaw = uploadMatch?.[1] ?? url.searchParams.get("object_key") ?? "";
    if (!objectKeyRaw) {
      return json({ code: "ERR_INVALID_UPLOAD_URL" }, 400);
    }

    const objectKey = decodeURIComponent(objectKeyRaw);
    await saveUploadObject(objectKey, request.body ?? new Uint8Array(0), storage);
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  if (request.method === "POST" && pathname === "/api/jobs") {
    const payload = await parseJsonBody<JobRequestPayload>(request.body, {
      font_object_key: "",
      tier: "6k",
      font_size_px: 28,
      output_width_px: 33,
      output_height_px: 39,
    });

    const uploadedFont = payload.font_object_key ? await loadUploadObject(payload.font_object_key, storage) : null;
    if (!payload.font_object_key || !uploadedFont) {
      return json({ code: "ERR_FONT_NOT_FOUND" }, 400);
    }

    const jobId = nextJobId();
    const queuedState: JobState = {
      job_id: jobId,
      status: "queued",
      request: payload,
      progress: {
        phase: "queued",
        percent: 0,
        done: 0,
        total: 0,
      },
    };
    await saveJobStateInternal(queuedState, storage);

    return json({ job_id: jobId }, 202);
  }

  const statusMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "GET" && statusMatch) {
    const jobId = statusMatch[1];
    const state = await loadJobState(jobId, storage);
    if (!state) {
      return json({ code: "ERR_JOB_NOT_FOUND" }, 404);
    }
    return json(state);
  }

  const downloadMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/download$/);
  if (request.method === "GET" && downloadMatch) {
    const jobId = downloadMatch[1];
    const state = await loadJobState(jobId, storage);
    if (!state || state.status !== "done") {
      return json({ code: "ERR_JOB_NOT_READY" }, 409);
    }
    return json({
      job_id: jobId,
      download_url: `/api/jobs/${jobId}/download/file`,
      output_name: state.output_name ?? `${jobId}.bin`,
    });
  }

  const fileMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/download\/file$/);
  if (request.method === "GET" && fileMatch) {
    const jobId = fileMatch[1];
    const state = await loadJobState(jobId, storage);
    if (!state || state.status !== "done" || !state.output_key) {
      return json({ code: "ERR_JOB_NOT_READY" }, 409);
    }

    const content = await loadOutputObject(state.output_key, storage);
    if (!content) {
      return json({ code: "ERR_OUTPUT_NOT_FOUND" }, 404);
    }

    return binary(content, state.output_name ?? `${jobId}.bin`);
  }

  return json({ code: "ERR_NOT_FOUND" }, 404);
}

