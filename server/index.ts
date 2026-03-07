import { createServer as createNodeServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createFileSystemStorage, readJsonObject, type AppStorage } from "../worker/src/storage.js";
import { processOneJob, type QueueMessage } from "../worker/src/consumer.js";
import { handleApiData } from "../worker/src/api.js";

const DEFAULT_PORT = 3000;

interface JobState {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  request?: Omit<QueueMessage, "job_id">;
}

const scheduledJobs = new Set<string>();

interface ServerOptions {
  storageRoot?: string;
  staticRoot?: string;
}

function toSingleBuffer(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function readRequestBody(request: import("node:http").IncomingMessage): Promise<Uint8Array | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") {
      chunks.push(new TextEncoder().encode(chunk));
      continue;
    }
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  return toSingleBuffer(chunks);
}

async function readJobState(storage: AppStorage, jobId: string): Promise<JobState | null> {
  return readJsonObject<JobState>(() => storage.readJob(jobId));
}

async function buildQueueMessage(storage: AppStorage, jobId: string): Promise<QueueMessage | null> {
  const state = await readJobState(storage, jobId);
  if (!state?.request) {
    return null;
  }

  return {
    job_id: state.job_id,
    ...state.request,
  };
}

async function scheduleQueuedJob(storage: AppStorage, jobId: string): Promise<boolean> {
  if (scheduledJobs.has(jobId)) {
    return false;
  }

  const job = await buildQueueMessage(storage, jobId);
  if (!job) {
    return false;
  }

  scheduledJobs.add(jobId);
  setImmediate(() => {
    void processOneJob(job, { storage })
      .catch(() => {
        return undefined;
      })
      .finally(() => {
        scheduledJobs.delete(jobId);
      });
  });
  return true;
}

function getContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

async function serveStaticFile(response: import("node:http").ServerResponse, filePath: string) {
  const file = await readFile(filePath);
  response.writeHead(200, { "content-type": getContentType(filePath) });
  response.end(file);
}

function isFrontendRoutePath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  const basename = path.posix.basename(pathname);
  return !basename.includes(".");
}

export function createServer(options: ServerOptions = {}) {
  const storage = createFileSystemStorage(options.storageRoot ?? path.resolve(process.cwd(), ".data"));
  const staticRoot = options.staticRoot ?? path.resolve(process.cwd(), "web/dist");

  return createNodeServer(async (request, response) => {
    try {
      const origin = `http://${request.headers.host || "127.0.0.1"}`;
      const url = new URL(request.url || "/", origin);

      if (request.method === "GET" && url.pathname === "/api/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        const method = (request.method || "GET").toUpperCase();

        const apiResponse = await handleApiData(
          {
            method,
            url: url.toString(),
            headers: request.headers as Record<string, string | string[] | undefined>,
            body: await readRequestBody(request),
          },
          { storage }
        );

        if (method === "POST" && url.pathname === "/api/jobs" && apiResponse.status === 202) {
          const created = JSON.parse(Buffer.from(await apiResponse.arrayBuffer()).toString("utf8")) as { job_id?: string };
          if (created.job_id) {
            await scheduleQueuedJob(storage, created.job_id);
          }

          response.statusCode = apiResponse.status;
          apiResponse.headers.forEach((value, key) => {
            response.setHeader(key, value);
          });
          response.end(JSON.stringify(created));
          return;
        }

        response.statusCode = apiResponse.status;
        apiResponse.headers.forEach((value, key) => {
          response.setHeader(key, value);
        });
        const buffer = Buffer.from(await apiResponse.arrayBuffer());
        response.end(buffer);
        return;
      }

      if (request.method === "GET" && !url.pathname.startsWith("/api")) {
        const requestedPath = decodeURIComponent(url.pathname);
        const resolvedPath = requestedPath === "/"
          ? path.join(staticRoot, "index.html")
          : path.resolve(staticRoot, `.${requestedPath}`);

        if (!resolvedPath.startsWith(staticRoot)) {
          response.writeHead(403, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Forbidden" }));
          return;
        }

        try {
          await serveStaticFile(response, resolvedPath);
          return;
        } catch {
          if (isFrontendRoutePath(requestedPath)) {
            try {
              await serveStaticFile(response, path.join(staticRoot, "index.html"));
              return;
            } catch {
              // fall through to the existing JSON 404 when no built frontend is present
            }
          }
        }
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Not Found" }));
    } catch {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  });
}

export function resolvePort(value = process.env.PORT): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return DEFAULT_PORT;
  }

  return port;
}

export function startServer(port = resolvePort()) {
  const server = createServer();
  server.listen(port);
  return server;
}

function isExecutedDirectly() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (process.env.NODE_ENV !== "test" && isExecutedDirectly()) {
  startServer();
}
