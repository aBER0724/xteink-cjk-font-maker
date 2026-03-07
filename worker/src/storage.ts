import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AppStorage {
  readUpload(key: string): Promise<Uint8Array | null>;
  writeUpload(key: string, value: Uint8Array): Promise<void>;
  readOutput(key: string): Promise<Uint8Array | null>;
  writeOutput(key: string, value: Uint8Array): Promise<void>;
  readJob(jobId: string): Promise<string | null>;
  writeJob(jobId: string, value: string): Promise<void>;
  claimJob(jobId: string, nextValue: string): Promise<boolean>;
  releaseJobClaim(jobId: string): Promise<void>;
}

export async function readJsonObject<T>(reader: () => Promise<string | null>): Promise<T | null> {
  const raw = await reader();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonObject(writer: (value: string) => Promise<void>, value: unknown): Promise<void> {
  await writer(JSON.stringify(value));
}

function safePathSegment(key: string): string {
  const normalized = path.posix.normalize(`/${key}`).slice(1);
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("invalid storage key");
  }
  return normalized;
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readFileIfExists(filePath: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(filePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function createFileSystemStorage(rootDir: string): AppStorage {
  const resolveUploadPath = (key: string) => path.join(rootDir, safePathSegment(key));
  const resolveOutputPath = (key: string) => path.join(rootDir, safePathSegment(key));
  const resolveJobPath = (jobId: string) => path.join(rootDir, "jobs", `${safePathSegment(jobId)}.json`);
  const resolveJobLockPath = (jobId: string) => path.join(rootDir, "jobs", `${safePathSegment(jobId)}.lock`);

  return {
    async readUpload(key: string) {
      return readFileIfExists(resolveUploadPath(key));
    },
    async writeUpload(key: string, value: Uint8Array) {
      const filePath = resolveUploadPath(key);
      await ensureParentDir(filePath);
      await writeFile(filePath, value);
    },
    async readOutput(key: string) {
      return readFileIfExists(resolveOutputPath(key));
    },
    async writeOutput(key: string, value: Uint8Array) {
      const filePath = resolveOutputPath(key);
      await ensureParentDir(filePath);
      await writeFile(filePath, value);
    },
    async readJob(jobId: string) {
      return readTextIfExists(resolveJobPath(jobId));
    },
    async writeJob(jobId: string, value: string) {
      const filePath = resolveJobPath(jobId);
      await ensureParentDir(filePath);
      await writeFile(filePath, value, "utf8");
    },
    async claimJob(jobId: string, nextValue: string) {
      const lockPath = resolveJobLockPath(jobId);
      await ensureParentDir(lockPath);

      let handle;
      try {
        handle = await open(lockPath, "wx");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          return false;
        }
        throw error;
      }

      try {
        await handle.close();
        await writeFile(resolveJobPath(jobId), nextValue, "utf8");
        return true;
      } catch (error) {
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
    },
    async releaseJobClaim(jobId: string) {
      const lockPath = resolveJobLockPath(jobId);
      await unlink(lockPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }
        throw error;
      });
    },
  };
}

export function createMemoryStorage(): AppStorage {
  const uploads = new Map<string, Uint8Array>();
  const outputs = new Map<string, Uint8Array>();
  const jobs = new Map<string, string>();
  const claimedJobs = new Set<string>();

  return {
    async readUpload(key: string) {
      return uploads.get(key) ?? null;
    },
    async writeUpload(key: string, value: Uint8Array) {
      uploads.set(key, value);
    },
    async readOutput(key: string) {
      return outputs.get(key) ?? null;
    },
    async writeOutput(key: string, value: Uint8Array) {
      outputs.set(key, value);
    },
    async readJob(jobId: string) {
      return jobs.get(jobId) ?? null;
    },
    async writeJob(jobId: string, value: string) {
      jobs.set(jobId, value);
    },
    async claimJob(jobId: string, nextValue: string) {
      if (claimedJobs.has(jobId)) {
        return false;
      }
      const current = jobs.get(jobId) ?? null;
      if (!current) {
        return false;
      }
      claimedJobs.add(jobId);
      jobs.set(jobId, nextValue);
      return true;
    },
    async releaseJobClaim(jobId: string) {
      claimedJobs.delete(jobId);
    },
  };
}
