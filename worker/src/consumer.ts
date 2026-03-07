import { convertFontToBin, type ConvertProgress } from "./converter.js";
import { readJsonObject, writeJsonObject, type AppStorage } from "./storage.js";

export interface QueueMessage {
  job_id: string;
  font_object_key: string;
  tier: "6k" | "24k" | "65k";
  font_size_px: number;
  letter_spacing_px?: number;
  line_spacing_px?: number;
  output_width_px?: number;
  output_height_px?: number;
  compat_flip_y?: boolean;
  font_name?: string;
}

interface PersistedJobState {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  output_key?: string;
  output_name?: string;
  error_message?: string;
  progress?: ConvertProgress | {
    phase: "processing" | "failed";
    percent: number;
    done: number;
    total: number;
  };
  request?: QueueMessage;
}

export interface JobResult {
  status: "done";
  output_key: string;
  output_name: string;
}

export interface ConsumerEnv {
  storage: AppStorage;
}

function outputNameForJob(msg: QueueMessage): string {
  const baseName = (msg.font_name ?? "download")
    .replace(/\.[^.]+$/, "")
    .trim() || "download";
  const width = msg.output_width_px ?? msg.letter_spacing_px ?? 33;
  const height = msg.output_height_px ?? msg.line_spacing_px ?? 39;
  return `${baseName}_${msg.font_size_px}_${width}x${height}.bin`;
}

async function writeJobState(storage: AppStorage, jobId: string, state: PersistedJobState): Promise<void> {
  await writeJsonObject((value) => storage.writeJob(jobId, value), state);
}

async function readJobState(storage: AppStorage, jobId: string): Promise<PersistedJobState | null> {
  return readJsonObject<PersistedJobState>(() => storage.readJob(jobId));
}

async function persistJobProgress(
  storage: AppStorage,
  jobId: string,
  fallbackRequest: QueueMessage,
  progress: ConvertProgress
): Promise<void> {
  const existingState = await readJobState(storage, jobId);
  if (existingState && existingState.status !== "processing") {
    return;
  }
  if (
    existingState?.status === "processing" &&
    existingState.progress?.phase === progress.phase &&
    existingState.progress?.percent === progress.percent
  ) {
    return;
  }
  await writeJobState(storage, jobId, {
    ...(existingState ?? {
      job_id: jobId,
      request: fallbackRequest,
    }),
    job_id: jobId,
    status: "processing",
    error_message: undefined,
    request: existingState?.request ?? fallbackRequest,
    progress,
  });
}

async function claimQueuedJob(storage: AppStorage, msg: QueueMessage): Promise<boolean> {
  const rawState = await storage.readJob(msg.job_id);
  const existingState = rawState ? await readJsonObject<PersistedJobState>(async () => rawState) : null;
  if (!existingState || existingState.status !== "queued") {
    return false;
  }

  const processingState: PersistedJobState = {
    ...existingState,
    job_id: msg.job_id,
    status: "processing",
    error_message: undefined,
    progress: {
      phase: "processing",
      percent: 0,
      done: 0,
      total: 1,
    },
    request: existingState.request ?? msg,
  };

  const nextRaw = JSON.stringify(processingState);
  return storage.claimJob(msg.job_id, nextRaw);
}

async function markJobFailed(storage: AppStorage, jobId: string, fallbackRequest: QueueMessage, error: unknown): Promise<never> {
  const existingState = await readJsonObject<PersistedJobState>(() => storage.readJob(jobId));
  try {
    await writeJobState(storage, jobId, {
      ...(existingState ?? {
        job_id: jobId,
        request: fallbackRequest,
      }),
      job_id: jobId,
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
      request: existingState?.request ?? fallbackRequest,
      progress: {
        phase: "failed",
        percent: 100,
        done: 1,
        total: 1,
      },
    });
  } finally {
    await storage.releaseJobClaim(jobId);
  }
  throw error;
}

export async function processOneJob(msg: QueueMessage, env: ConsumerEnv): Promise<JobResult> {
  let progressWrite = Promise.resolve();

  try {
    const claimed = await claimQueuedJob(env.storage, msg);
    if (!claimed) {
      const currentState = await readJsonObject<PersistedJobState>(() => env.storage.readJob(msg.job_id));
      if (currentState?.status === "done" && currentState.output_key && currentState.output_name) {
        return {
          status: "done",
          output_key: currentState.output_key,
          output_name: currentState.output_name,
        };
      }
      throw new Error(`job is not claimable: ${msg.job_id}`);
    }

    const fontBytes = await env.storage.readUpload(msg.font_object_key);
    if (!fontBytes) {
      throw new Error(`missing font object: ${msg.font_object_key}`);
    }

    const out = await convertFontToBin(
      {
        fontData: fontBytes,
        tier: msg.tier,
        fontSizePx: msg.font_size_px,
        outputWidthPx: msg.output_width_px ?? msg.letter_spacing_px ?? 33,
        outputHeightPx: msg.output_height_px ?? msg.line_spacing_px ?? 39,
        compatFlipY: msg.compat_flip_y !== false,
      },
      (progress) => {
        progressWrite = progressWrite.then(() => persistJobProgress(env.storage, msg.job_id, msg, progress));
      }
    );
    await progressWrite;

    const outputKey = `outputs/${msg.job_id}.bin`;
    const outputName = outputNameForJob(msg);
    await env.storage.writeOutput(outputKey, out.data);
    await writeJobState(env.storage, msg.job_id, {
      job_id: msg.job_id,
      status: "done",
      output_key: outputKey,
      output_name: outputName,
      request: msg,
      progress: {
        phase: "done",
        percent: 100,
        done: 1,
        total: 1,
      },
    });

    await env.storage.releaseJobClaim(msg.job_id);

    return {
      status: "done",
      output_key: outputKey,
      output_name: outputName,
    };
  } catch (error) {
    if (error instanceof Error && error.message === `job is not claimable: ${msg.job_id}`) {
      throw error;
    }
    try {
      await progressWrite;
    } catch {
      // Keep the original failure and still persist the final failed state.
    }
    return markJobFailed(env.storage, msg.job_id, msg, error);
  }
}
