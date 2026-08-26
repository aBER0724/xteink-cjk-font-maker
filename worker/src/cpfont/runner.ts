import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cpfontPhysicalSizes, type CpfontCapability } from "./types.js";
import { validateCpfontFamily, type ValidatedCpfontFile } from "./validator.js";


const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const STDERR_LIMIT = 64 * 1024;

export interface CpfontProgress {
  phase: "preparing" | "rasterizing" | "validating" | "packaging";
  percent: number;
  done: number;
  total: number;
}

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  cwd: string;
  shell: false;
  timeoutMs: number;
  maxStderrBytes: number;
}

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => Promise<SpawnResult>;

export interface CpfontConversionInput {
  capability: CpfontCapability;
  fontData: Uint8Array;
  sourceName: string;
  familyName: string;
  readerSizes?: number[];
  forceAutohint?: boolean;
  timeoutMs?: number;
  maxFileBytes?: number;
  maxPackageBytes?: number;
  spawn?: SpawnProcess;
  onProgress?: (progress: CpfontProgress) => void;
}

export interface CpfontConversionResult {
  files: ValidatedCpfontFile[];
  outputDir: string;
  inputPath: string;
  readFile(name: string): Promise<Uint8Array>;
}

export class CpfontRunnerError extends Error {
  readonly stderr?: string;

  constructor(readonly code: string, message: string, stderr?: string) {
    super(message);
    this.stderr = stderr;
  }
}

function extensionForSource(name: string): ".ttf" | ".otf" {
  return path.extname(name).toLowerCase() === ".otf" ? ".otf" : ".ttf";
}

function emit(input: CpfontConversionInput, phase: CpfontProgress["phase"], percent: number): void {
  input.onProgress?.({ phase, percent, done: percent, total: 100 });
}

function appendCapped(chunks: Buffer[], total: { value: number }, chunk: Buffer, limit: number): void {
  if (total.value >= limit) return;
  const remaining = limit - total.value;
  const selected = chunk.subarray(0, remaining);
  chunks.push(selected);
  total.value += selected.length;
}

export const spawnProcess: SpawnProcess = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const stdoutBytes = { value: 0 };
  const stderrBytes = { value: 0 };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, options.timeoutMs);
  child.stdout?.on("data", (chunk: Buffer) => appendCapped(stdout, stdoutBytes, chunk, options.maxStderrBytes));
  child.stderr?.on("data", (chunk: Buffer) => appendCapped(stderr, stderrBytes, chunk, options.maxStderrBytes));
  child.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    if (timedOut) {
      reject(Object.assign(new Error("cpfont conversion timed out"), { code: "ETIMEDOUT" }));
      return;
    }
    resolve({ code, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
  });
});

export async function runCpfontConversion(input: CpfontConversionInput): Promise<CpfontConversionResult> {
  const capability = input.capability;
  if (!capability.available || !capability.root || !capability.converterPath || !capability.fallbackPath || !capability.pythonPath) {
    throw new CpfontRunnerError(capability.reason ?? "ERR_CPFONT_TOOL_MISSING", "cpfont toolchain is unavailable");
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "crosspoint-cpfont-"));
  const outputDir = path.join(tempRoot, "output");
  const inputPath = path.join(tempRoot, `input${extensionForSource(input.sourceName)}`);
  const canonicalOutputDir = path.resolve(outputDir);
  const run = input.spawn ?? spawnProcess;
  let keepOutput = false;
  try {
    emit(input, "preparing", 5);
    await writeFile(inputPath, input.fontData);
    const args = [
      capability.converterPath,
      inputPath,
      "--style", "regular",
      "--fallback-regular", capability.fallbackPath,
      "--intervals", "latin-ext,cjk",
      "--sizes", cpfontPhysicalSizes(input.readerSizes).join(","),
      "--name", input.familyName,
      "--output-dir", outputDir,
    ];
    if (input.forceAutohint) args.push("--force-autohint");
    emit(input, "rasterizing", 10);

    let processResult: SpawnResult;
    try {
      processResult = await run(capability.pythonPath, args, {
        cwd: capability.root,
        shell: false,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxStderrBytes: STDERR_LIMIT,
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ETIMEDOUT") {
        throw new CpfontRunnerError("ERR_CPFONT_TIMEOUT", "cpfont conversion timed out");
      }
      throw new CpfontRunnerError("ERR_CPFONT_PROCESS_START", "could not start cpfont converter");
    }
    const stderr = processResult.stderr.slice(0, STDERR_LIMIT);
    if (processResult.code !== 0) {
      throw new CpfontRunnerError("ERR_CPFONT_CONVERTER", "cpfont converter failed", stderr);
    }

    emit(input, "validating", 85);
    const files = await validateCpfontFamily(outputDir, input.familyName, cpfontPhysicalSizes(input.readerSizes), {
      maxFileBytes: input.maxFileBytes,
      maxPackageBytes: input.maxPackageBytes,
    });
    keepOutput = true;
    await rm(inputPath, { force: true });
    return {
      files,
      outputDir,
      inputPath,
      async readFile(name: string) {
        if (path.basename(name) !== name) {
          throw new CpfontRunnerError("ERR_CPFONT_OUTPUT_INVALID", "unsafe output filename");
        }
        const file = path.resolve(outputDir, name);
        if (path.dirname(file) !== canonicalOutputDir) {
          throw new CpfontRunnerError("ERR_CPFONT_OUTPUT_INVALID", "unsafe output filename");
        }
        return new Uint8Array(await readFile(file));
      },
    };
  } catch (error) {
    throw error;
  } finally {
    if (!keepOutput) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export async function cleanupCpfontConversion(result: CpfontConversionResult): Promise<void> {
  await rm(path.dirname(result.outputDir), { recursive: true, force: true });
}
