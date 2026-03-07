import type { CharsetTier } from "./charset.js";
import opentype from "opentype.js";
import { loadTier } from "./charset.js";

export interface ConvertInput {
  fontData: Uint8Array;
  tier: CharsetTier;
  fontSizePx: number;
  outputWidthPx: number;
  outputHeightPx: number;
  fontWeight?: number;
  compatFlipY?: boolean;
}

export interface ConvertOutput {
  data: Uint8Array;
  width: number;
  height: number;
  bytesPerGlyph: number;
}

export interface ConvertProgress {
  phase: "measuring" | "rendering" | "done";
  done: number;
  total: number;
  percent: number;
}

export type ConvertProgressCallback = (progress: ConvertProgress) => void;

const BMP_SLOT_COUNT = 0x10000;
const MEASURE_WEIGHT_PERCENT = 15;
const FONT_WEIGHT_MIN = 300;
const FONT_WEIGHT_MAX = 650;
const FONT_WEIGHT_BASE = 400;
const MAX_WEIGHT_PASSES = 1.6;
const DILATION_OFFSETS: Array<[number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

interface Point {
  x: number;
  y: number;
}

interface PathCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface GlyphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RenderLayout {
  width: number;
  height: number;
  widthByte: number;
  bytesPerGlyph: number;
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mapCommandNumbers(command: PathCommand, mapper: (x: number, y: number) => Point): PathCommand {
  const next: PathCommand = { ...command };

  if (next.x !== undefined && next.y !== undefined) {
    const p = mapper(next.x, next.y);
    next.x = p.x;
    next.y = p.y;
  }
  if (next.x1 !== undefined && next.y1 !== undefined) {
    const p = mapper(next.x1, next.y1);
    next.x1 = p.x;
    next.y1 = p.y;
  }
  if (next.x2 !== undefined && next.y2 !== undefined) {
    const p = mapper(next.x2, next.y2);
    next.x2 = p.x;
    next.y2 = p.y;
  }

  return next;
}

function commandBounds(commands: PathCommand[]): GlyphBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const cmd of commands) {
    if (cmd.x !== undefined && cmd.y !== undefined) {
      minX = Math.min(minX, cmd.x);
      minY = Math.min(minY, cmd.y);
      maxX = Math.max(maxX, cmd.x);
      maxY = Math.max(maxY, cmd.y);
    }
    if (cmd.x1 !== undefined && cmd.y1 !== undefined) {
      minX = Math.min(minX, cmd.x1);
      minY = Math.min(minY, cmd.y1);
      maxX = Math.max(maxX, cmd.x1);
      maxY = Math.max(maxY, cmd.y1);
    }
    if (cmd.x2 !== undefined && cmd.y2 !== undefined) {
      minX = Math.min(minX, cmd.x2);
      minY = Math.min(minY, cmd.y2);
      maxX = Math.max(maxX, cmd.x2);
      maxY = Math.max(maxY, cmd.y2);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function quadraticPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function pathToContours(commands: PathCommand[]): Point[][] {
  const contours: Point[][] = [];
  let contour: Point[] = [];
  let cursor: Point | null = null;

  const closeContour = (): void => {
    if (contour.length >= 3) {
      contours.push(contour);
    }
    contour = [];
  };

  for (const cmd of commands) {
    if (cmd.type === "M" && cmd.x !== undefined && cmd.y !== undefined) {
      closeContour();
      cursor = { x: cmd.x, y: cmd.y };
      contour.push(cursor);
      continue;
    }

    if (!cursor) {
      continue;
    }

    if (cmd.type === "L" && cmd.x !== undefined && cmd.y !== undefined) {
      cursor = { x: cmd.x, y: cmd.y };
      contour.push(cursor);
      continue;
    }

    if (cmd.type === "Q" && cmd.x !== undefined && cmd.y !== undefined && cmd.x1 !== undefined && cmd.y1 !== undefined) {
      const p0 = cursor;
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x, y: cmd.y };
      for (let i = 1; i <= 8; i += 1) {
        contour.push(quadraticPoint(p0, p1, p2, i / 8));
      }
      cursor = p2;
      continue;
    }

    if (
      cmd.type === "C" &&
      cmd.x !== undefined &&
      cmd.y !== undefined &&
      cmd.x1 !== undefined &&
      cmd.y1 !== undefined &&
      cmd.x2 !== undefined &&
      cmd.y2 !== undefined
    ) {
      const p0 = cursor;
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x2, y: cmd.y2 };
      const p3 = { x: cmd.x, y: cmd.y };
      for (let i = 1; i <= 12; i += 1) {
        contour.push(cubicPoint(p0, p1, p2, p3, i / 12));
      }
      cursor = p3;
      continue;
    }

    if (cmd.type === "Z") {
      closeContour();
      cursor = null;
    }
  }

  closeContour();
  return contours;
}

function pointInContours(x: number, y: number, contours: Point[][]): boolean {
  let inside = false;

  for (const contour of contours) {
    if (contour.length < 3) {
      continue;
    }

    for (let i = 0, j = contour.length - 1; i < contour.length; j = i, i += 1) {
      const xi = contour[i].x;
      const yi = contour[i].y;
      const xj = contour[j].x;
      const yj = contour[j].y;

      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersects) {
        inside = !inside;
      }
    }
  }

  return inside;
}

function isRenderableCodePoint(codePoint: number): boolean {
  return codePoint >= 0 && codePoint <= 0xffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
}

function glyphCommands(glyph: opentype.Glyph, fontSizePx: number): PathCommand[] {
  const path = glyph.getPath(0, 0, fontSizePx);
  return (path.commands as PathCommand[]).map((cmd) => mapCommandNumbers(cmd, (x, y) => ({ x, y: -y })));
}

function createProgressEmitter(onProgress?: ConvertProgressCallback): ConvertProgressCallback {
  if (!onProgress) {
    return () => undefined;
  }

  let lastPhase: ConvertProgress["phase"] | null = null;
  let lastPercent = -1;
  return (progress) => {
    const safePercent = Math.min(100, Math.max(0, Math.round(Number(progress.percent) || 0)));
    if (progress.phase === lastPhase && safePercent === lastPercent) {
      return;
    }
    lastPhase = progress.phase;
    lastPercent = safePercent;
    onProgress({
      phase: progress.phase,
      done: Math.max(0, Math.round(Number(progress.done) || 0)),
      total: Math.max(0, Math.round(Number(progress.total) || 0)),
      percent: safePercent,
    });
  };
}

function percentForPhase(phase: ConvertProgress["phase"], done: number, total: number): number {
  if (phase === "done") {
    return 100;
  }
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const ratio = Math.min(1, Math.max(0, done / total));
  if (phase === "measuring") {
    return Math.min(MEASURE_WEIGHT_PERCENT, Math.floor(ratio * MEASURE_WEIGHT_PERCENT));
  }
  const span = 99 - MEASURE_WEIGHT_PERCENT;
  return Math.min(99, MEASURE_WEIGHT_PERCENT + Math.floor(ratio * span));
}

async function createRenderLayout(
  font: opentype.Font,
  codePoints: number[],
  input: ConvertInput,
  emit?: ConvertProgressCallback
): Promise<RenderLayout> {
  let maxWidth = 0;
  let maxHeight = 0;

  emit?.({
    phase: "measuring",
    done: 0,
    total: codePoints.length,
    percent: percentForPhase("measuring", 0, codePoints.length),
  });

  for (let i = 0; i < codePoints.length; i += 1) {
    const codePoint = codePoints[i];

    const glyph = font.charToGlyph(String.fromCodePoint(codePoint));
    if (!glyph || glyph.path.commands.length === 0) {
      if ((i & 127) === 0 || i === codePoints.length - 1) {
        emit?.({
          phase: "measuring",
          done: i + 1,
          total: codePoints.length,
          percent: percentForPhase("measuring", i + 1, codePoints.length),
        });
      }
      continue;
    }

    const bounds = commandBounds(glyphCommands(glyph, input.fontSizePx));
    if (!bounds) {
      continue;
    }

    maxWidth = Math.max(maxWidth, bounds.maxX - bounds.minX);
    maxHeight = Math.max(maxHeight, bounds.maxY - bounds.minY);

    if ((i & 127) === 0 || i === codePoints.length - 1) {
      emit?.({
        phase: "measuring",
        done: i + 1,
        total: codePoints.length,
        percent: percentForPhase("measuring", i + 1, codePoints.length),
      });
    }

    if ((i & 255) === 0) {
      await yieldToEventLoop();
    }
  }

  const measuredWidth = Math.max(1, Math.ceil(maxWidth));
  const measuredHeight = Math.max(1, Math.ceil(maxHeight));
  const width = Math.max(1, Number.isFinite(input.outputWidthPx) ? Math.round(input.outputWidthPx) : measuredWidth);
  const height = Math.max(1, Number.isFinite(input.outputHeightPx) ? Math.round(input.outputHeightPx) : measuredHeight);
  const widthByte = Math.ceil(width / 8);

  return {
    width,
    height,
    widthByte,
    bytesPerGlyph: widthByte * height,
  };
}

function renderGlyphBytes(
  glyph: opentype.Glyph,
  fontSizePx: number,
  layout: RenderLayout,
  compatFlipY: boolean,
  fontWeight: number
): Uint8Array {
  const commands = glyphCommands(glyph, fontSizePx);
  const bounds = commandBounds(commands);
  if (!bounds) {
    return new Uint8Array(layout.bytesPerGlyph);
  }

  const glyphWidth = bounds.maxX - bounds.minX;
  const glyphHeight = bounds.maxY - bounds.minY;
  if (glyphWidth <= 0 || glyphHeight <= 0) {
    return new Uint8Array(layout.bytesPerGlyph);
  }

  const dx = Math.floor((layout.width - glyphWidth) / 2) - bounds.minX;
  const dy = Math.floor((layout.height - glyphHeight) / 2) - bounds.minY;

  const translated = commands.map((cmd) =>
    mapCommandNumbers(cmd, (x, y) => ({
      x: x + dx,
      y: y + dy,
    }))
  );

  const contours = pathToContours(translated);
  const glyphBytes = new Uint8Array(layout.bytesPerGlyph);

  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      if (!pointInContours(x + 0.5, y + 0.5, contours)) {
        continue;
      }
      const writeX = x;
      const writeY = compatFlipY ? layout.height - 1 - y : y;
      const byteIndex = writeY * layout.widthByte + (writeX >> 3);
      glyphBytes[byteIndex] |= 1 << (7 - (writeX & 7));
    }
  }

  return applyGlyphWeight(glyphBytes, layout, fontWeight);
}

function isPixelSet(bytes: Uint8Array, layout: RenderLayout, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) {
    return false;
  }
  const index = y * layout.widthByte + (x >> 3);
  return (bytes[index] & (1 << (7 - (x & 7)))) !== 0;
}

function setPixel(bytes: Uint8Array, layout: RenderLayout, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) {
    return;
  }
  const index = y * layout.widthByte + (x >> 3);
  bytes[index] |= 1 << (7 - (x & 7));
}

function dilateGlyph(bytes: Uint8Array, layout: RenderLayout, neighborBudget: number): Uint8Array {
  const next = new Uint8Array(bytes);
  const budget = Math.max(0, Math.min(DILATION_OFFSETS.length, neighborBudget));
  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      if (!isPixelSet(bytes, layout, x, y)) {
        continue;
      }
      setPixel(next, layout, x, y);
      for (let i = 0; i < budget; i += 1) {
        const [ox, oy] = DILATION_OFFSETS[i];
        setPixel(next, layout, x + ox, y + oy);
      }
    }
  }
  return next;
}

function erodeGlyph(bytes: Uint8Array, layout: RenderLayout, neighborThreshold: number): Uint8Array {
  const next = new Uint8Array(layout.bytesPerGlyph);
  const threshold = Math.max(1, Math.min(8, neighborThreshold));
  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      if (!isPixelSet(bytes, layout, x, y)) {
        continue;
      }

      let neighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) {
            continue;
          }
          if (isPixelSet(bytes, layout, x + ox, y + oy)) {
            neighbors += 1;
          }
        }
      }

      if (neighbors >= threshold) {
        setPixel(next, layout, x, y);
      }
    }
  }
  return next;
}

function resolveWeightPasses(fontWeight: number): { signed: -1 | 0 | 1; fullPasses: number; fractionalPass: number } {
  if (!Number.isFinite(fontWeight)) {
    return { signed: 0, fullPasses: 0, fractionalPass: 0 };
  }

  const clamped = Math.min(FONT_WEIGHT_MAX, Math.max(FONT_WEIGHT_MIN, Number(fontWeight)));
  const delta = clamped - FONT_WEIGHT_BASE;
  if (delta === 0) {
    return { signed: 0, fullPasses: 0, fractionalPass: 0 };
  }

  const maxDelta = delta > 0 ? FONT_WEIGHT_MAX - FONT_WEIGHT_BASE : FONT_WEIGHT_BASE - FONT_WEIGHT_MIN;
  const normalized = Math.min(1, Math.abs(delta) / maxDelta);
  const strength = normalized * MAX_WEIGHT_PASSES;
  return {
    signed: delta > 0 ? 1 : -1,
    fullPasses: Math.floor(strength),
    fractionalPass: strength - Math.floor(strength),
  };
}

function applyGlyphWeight(glyphBytes: Uint8Array, layout: RenderLayout, fontWeight: number): Uint8Array {
  const profile = resolveWeightPasses(fontWeight);
  if (profile.signed === 0) {
    return glyphBytes;
  }

  let next = glyphBytes;

  if (profile.signed > 0) {
    for (let i = 0; i < profile.fullPasses; i += 1) {
      next = dilateGlyph(next, layout, 8);
    }
    if (profile.fractionalPass > 0) {
      const budget = Math.max(1, Math.round(profile.fractionalPass * 8));
      next = dilateGlyph(next, layout, budget);
    }
    return next;
  }

  for (let i = 0; i < profile.fullPasses; i += 1) {
    next = erodeGlyph(next, layout, 5);
  }
  if (profile.fractionalPass > 0) {
    const threshold = 5 + Math.max(1, Math.round(profile.fractionalPass * 3));
    next = erodeGlyph(next, layout, threshold);
  }
  return next;
}

export async function convertFontToBin(input: ConvertInput, onProgress?: ConvertProgressCallback): Promise<ConvertOutput> {
  const font = opentype.parse(toExactArrayBuffer(input.fontData));
  const selectedCodePoints = loadTier(input.tier);
  const codePoints = Array.from(selectedCodePoints).filter((codePoint) => isRenderableCodePoint(codePoint));
  const emit = createProgressEmitter(onProgress);

  const layout = await createRenderLayout(font, codePoints, input, emit);
  const out = new Uint8Array(layout.bytesPerGlyph * BMP_SLOT_COUNT);
  const compatFlipY = input.compatFlipY ?? true;
  const fontWeight = Number.isFinite(input.fontWeight) ? Number(input.fontWeight) : 400;

  emit({
    phase: "rendering",
    done: 0,
    total: codePoints.length,
    percent: percentForPhase("rendering", 0, codePoints.length),
  });

  for (let i = 0; i < codePoints.length; i += 1) {
    const codePoint = codePoints[i];
    const glyph = font.charToGlyph(String.fromCodePoint(codePoint));
    if (!glyph || glyph.path.commands.length === 0) {
      if ((i & 63) === 0 || i === codePoints.length - 1) {
        emit({
          phase: "rendering",
          done: i + 1,
          total: codePoints.length,
          percent: percentForPhase("rendering", i + 1, codePoints.length),
        });
      }
      continue;
    }

    const slot = renderGlyphBytes(glyph, input.fontSizePx, layout, compatFlipY, fontWeight);
    out.set(slot, codePoint * layout.bytesPerGlyph);

    if ((i & 63) === 0 || i === codePoints.length - 1) {
      emit({
        phase: "rendering",
        done: i + 1,
        total: codePoints.length,
        percent: percentForPhase("rendering", i + 1, codePoints.length),
      });
    }

    if ((i & 255) === 0) {
      await yieldToEventLoop();
    }
  }

  emit({
    phase: "done",
    done: codePoints.length,
    total: codePoints.length,
    percent: 100,
  });

  return {
    data: out,
    width: layout.width,
    height: layout.height,
    bytesPerGlyph: layout.bytesPerGlyph,
  };
}
