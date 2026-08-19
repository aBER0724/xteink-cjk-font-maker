import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCpfontConversion, type SpawnProcess } from "../../worker/src/cpfont/runner";
import { CPFONT_PHYSICAL_SIZES, type CpfontCapability } from "../../worker/src/cpfont/types";


function capability(root: string): CpfontCapability {
  return {
    available: true,
    version: 4,
    sizes: CPFONT_PHYSICAL_SIZES,
    root,
    converterPath: path.join(root, "scripts", "fontconvert_sdcard.py"),
    fallbackPath: path.join(root, "vendor", "NotoSans-Regular.ttf"),
    pythonPath: "python-test",
  };
}

function tinyCpfont(): Uint8Array {
  const header = Buffer.alloc(32);
  header.write("CPFONT\0\0", 0, "binary");
  header.writeUInt16LE(4, 8);
  header.writeUInt16LE(1, 10);
  header.writeUInt8(1, 12);
  const toc = Buffer.alloc(32);
  toc.writeUInt8(0, 0);
  toc.writeUInt32LE(1, 4);
  toc.writeUInt32LE(1, 8);
  toc.writeUInt8(4, 12);
  toc.writeInt16LE(3, 13);
  toc.writeInt16LE(-1, 15);
  toc.writeUInt32LE(64, 24);
  const interval = Buffer.alloc(12);
  interval.writeUInt32LE(0x41, 0);
  interval.writeUInt32LE(0x41, 4);
  const glyph = Buffer.alloc(16);
  glyph.writeUInt8(1, 0);
  glyph.writeUInt8(1, 1);
  glyph.writeUInt16LE(16, 2);
  glyph.writeInt16LE(1, 6);
  glyph.writeUInt16LE(1, 8);
  return new Uint8Array(Buffer.concat([header, toc, interval, glyph, Buffer.from([0xc0])]));
}


async function writeOutputs(args: string[]): Promise<void> {
  const output = args[args.indexOf("--output-dir") + 1];
  const family = args[args.indexOf("--name") + 1];
  await import("node:fs/promises").then(({ mkdir }) => mkdir(output, { recursive: true }));
  for (const size of CPFONT_PHYSICAL_SIZES) {
    await writeFile(path.join(output, `${family}_${size}.cpfont`), tinyCpfont());
  }
}


describe("canonical cpfont runner", () => {
  it("spawns Python without a shell using the exact canonical arguments", async () => {
    const toolkit = await mkdtemp(path.join(os.tmpdir(), "cpfont-runner-tool-"));
    let capturedInputPath = "";
    const calls: Array<{ command: string; args: string[]; options: unknown }> = [];
    const spawn: SpawnProcess = async (command, args, options) => {
      calls.push({ command, args: [...args], options });
      capturedInputPath = args[1];
      await writeOutputs(args);
      return { code: 0, signal: null, stdout: "", stderr: "ok" };
    };
    const phases: string[] = [];

    const result = await runCpfontConversion({
      capability: capability(toolkit),
      fontData: new Uint8Array([1, 2, 3]),
      sourceName: "unsafe name;$(echo).ttf",
      familyName: "ExampleCJK",
      forceAutohint: true,
      spawn,
      onProgress: (progress) => phases.push(progress.phase),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("python-test");
    expect(calls[0].options).toMatchObject({ shell: false, timeoutMs: 15 * 60 * 1000 });
    expect(calls[0].args).toEqual(expect.arrayContaining([
      path.join(toolkit, "scripts", "fontconvert_sdcard.py"),
      expect.stringMatching(/input\.(ttf|otf)$/),
      "--style", "regular",
      "--fallback-regular", path.join(toolkit, "vendor", "NotoSans-Regular.ttf"),
      "--intervals", "latin-ext,cjk",
      "--sizes", "8,10,12,14,16,18,22",
      "--name", "ExampleCJK",
      "--force-autohint",
    ]));
    expect(calls[0].args.join(" ")).not.toContain("$(echo)");
    expect(result.files).toHaveLength(7);
    expect(phases).toEqual(["preparing", "rasterizing", "validating"]);
    await expect(readFile(capturedInputPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("caps stderr and maps spawn/timeout/converter failures to stable errors", async () => {
    const toolkit = await mkdtemp(path.join(os.tmpdir(), "cpfont-runner-fail-"));
    const failedSpawn: SpawnProcess = async () => ({ code: 2, signal: null, stdout: "", stderr: "x".repeat(100_000) });
    await expect(runCpfontConversion({
      capability: capability(toolkit), fontData: new Uint8Array([1]), sourceName: "font.ttf", familyName: "ExampleCJK", spawn: failedSpawn,
    })).rejects.toMatchObject({ code: "ERR_CPFONT_CONVERTER", stderr: expect.stringMatching(/^x{65536}$/) });

    const timeout: SpawnProcess = async () => { const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); throw error; };
    await expect(runCpfontConversion({
      capability: capability(toolkit), fontData: new Uint8Array([1]), sourceName: "font.ttf", familyName: "ExampleCJK", spawn: timeout,
    })).rejects.toMatchObject({ code: "ERR_CPFONT_TIMEOUT" });

    const noStart: SpawnProcess = async () => { const error = Object.assign(new Error("spawn"), { code: "ENOENT" }); throw error; };
    await expect(runCpfontConversion({
      capability: capability(toolkit), fontData: new Uint8Array([1]), sourceName: "font.ttf", familyName: "ExampleCJK", spawn: noStart,
    })).rejects.toMatchObject({ code: "ERR_CPFONT_PROCESS_START" });
  });
});
