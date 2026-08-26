import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CPFONT_PHYSICAL_SIZES } from "../../worker/src/cpfont/types";
import { CpfontValidationError, validateCpfontFamily } from "../../worker/src/cpfont/validator";


function tinyCpfont(options: { version?: number; styleId?: number; bitmapOffset?: number } = {}): Uint8Array {
  const version = options.version ?? 4;
  const styleId = options.styleId ?? 0;
  const bitmapOffset = options.bitmapOffset ?? 0;
  const header = Buffer.alloc(32);
  header.write("CPFONT\0\0", 0, "binary");
  header.writeUInt16LE(version, 8);
  header.writeUInt16LE(1, 10);
  header.writeUInt8(1, 12);
  const toc = Buffer.alloc(32);
  toc.writeUInt8(styleId, 0);
  toc.writeUInt32LE(1, 4);
  toc.writeUInt32LE(1, 8);
  toc.writeUInt8(4, 12);
  toc.writeInt16LE(3, 13);
  toc.writeInt16LE(-1, 15);
  toc.writeUInt32LE(64, 24);
  const interval = Buffer.alloc(12);
  interval.writeUInt32LE(0x41, 0);
  interval.writeUInt32LE(0x41, 4);
  interval.writeUInt32LE(0, 8);
  const glyph = Buffer.alloc(16);
  glyph.writeUInt8(1, 0);
  glyph.writeUInt8(1, 1);
  glyph.writeUInt16LE(16, 2);
  glyph.writeInt16LE(0, 4);
  glyph.writeInt16LE(1, 6);
  glyph.writeUInt16LE(1, 8);
  glyph.writeUInt32LE(bitmapOffset, 12);
  return new Uint8Array(Buffer.concat([header, toc, interval, glyph, Buffer.from([0xc0])]));
}


async function makeFamily(options: Parameters<typeof tinyCpfont>[0] = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "cpfont-validator-"));
  const family = "ExampleCJK";
  for (const size of CPFONT_PHYSICAL_SIZES) {
    await writeFile(path.join(root, `${family}_${size}.cpfont`), tinyCpfont(options));
  }
  return { root, family };
}


describe("cpfont v4 output validation", () => {
  it("accepts exactly seven regular v4 files and returns their metadata", async () => {
    const { root, family } = await makeFamily();

    const validated = await validateCpfontFamily(root, family);

    expect(validated.map((entry) => entry.physicalSize)).toEqual(CPFONT_PHYSICAL_SIZES);
    expect(validated.every((entry) => entry.byteSize === 93)).toBe(true);
    expect(validated.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256))).toBe(true);
  });

  it("rejects missing, unexpected, wrong-version, and non-regular files", async () => {
    const missing = await makeFamily();
    await import("node:fs/promises").then(({ unlink }) => unlink(path.join(missing.root, `${missing.family}_22.cpfont`)));
    await expect(validateCpfontFamily(missing.root, missing.family)).rejects.toThrow(/exactly 7/);

    const unexpected = await makeFamily();
    await writeFile(path.join(unexpected.root, "extra.txt"), "unexpected");
    await expect(validateCpfontFamily(unexpected.root, unexpected.family)).rejects.toThrow(/unexpected output/);

    const wrongVersion = await makeFamily({ version: 3 });
    await expect(validateCpfontFamily(wrongVersion.root, wrongVersion.family)).rejects.toThrow(/version/);

    const wrongStyle = await makeFamily({ styleId: 1 });
    await expect(validateCpfontFamily(wrongStyle.root, wrongStyle.family)).rejects.toThrow(/regular style/);
  });

  it("rejects out-of-range bitmap sections and configured size limits", async () => {
    const invalidRange = await makeFamily({ bitmapOffset: 99 });
    await expect(validateCpfontFamily(invalidRange.root, invalidRange.family)).rejects.toThrow(/bitmap range/);

    const valid = await makeFamily();
    await expect(validateCpfontFamily(valid.root, valid.family, { maxFileBytes: 92 })).rejects.toThrow(/file size limit/);
    await expect(validateCpfontFamily(valid.root, valid.family, { maxPackageBytes: 92 * 7 })).rejects.toThrow(/package size limit/);
  });

  it("uses stable validation errors", async () => {
    const { root, family } = await makeFamily();
    const target = path.join(root, `${family}_8.cpfont`);
    await rm(target);
    await mkdir(target);

    await expect(validateCpfontFamily(root, family)).rejects.toBeInstanceOf(CpfontValidationError);
  });
});
