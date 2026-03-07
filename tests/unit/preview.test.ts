import { describe, expect, it } from "vitest";
import {
  DEVICE_PROFILE,
  estimateOutputSizeBytes,
  FONT_WEIGHT_MAX,
  FONT_WEIGHT_MIN,
  buildPreviewModel,
  resolveWeightProfile,
} from "../../web/app";

describe("device preview model", () => {
  it("exposes XTEink device profile", () => {
    expect(DEVICE_PROFILE.widthPx).toBe(480);
    expect(DEVICE_PROFILE.heightPx).toBe(800);
    expect(DEVICE_PROFILE.ppi).toBe(233);
  });

  it("computes scaled viewport and typography", () => {
    const model = buildPreviewModel({
      containerWidthPx: 240,
      fontSizePx: 28,
      outputWidthPx: 33,
      outputHeightPx: 39,
    });

    expect(model.scale).toBeCloseTo(0.5, 5);
    expect(model.viewportCssWidthPx).toBeCloseTo(240, 5);
    expect(model.viewportCssHeightPx).toBeCloseTo(400, 5);
    expect(model.typography.fontSizePx).toBe(28);
    expect(model.typography.letterSpacingPx).toBe(5);
    expect(model.typography.lineHeightPx).toBe(39);
    expect(model.physical.diagonalIn).toBeCloseTo(4.0, 1);
  });

  it("maps font weight to a fine-grained signed pass profile", () => {
    const normal = resolveWeightProfile(400);
    const mediumBold = resolveWeightProfile(500);
    const heavyBold = resolveWeightProfile(FONT_WEIGHT_MAX);
    const thin = resolveWeightProfile(FONT_WEIGHT_MIN);

    expect(normal.signed).toBe(0);
    expect(normal.fullPasses).toBe(0);
    expect(normal.fractionalPass).toBe(0);

    expect(mediumBold.signed).toBe(1);
    expect(mediumBold.fullPasses + mediumBold.fractionalPass).toBeGreaterThan(0);
    expect(heavyBold.signed).toBe(1);
    expect(heavyBold.fullPasses + heavyBold.fractionalPass).toBeGreaterThan(
      mediumBold.fullPasses + mediumBold.fractionalPass
    );

    expect(thin.signed).toBe(-1);
  });

  it("estimates output bin size from glyph cell dimensions", () => {
    expect(estimateOutputSizeBytes({ outputWidthPx: 33, outputHeightPx: 39 })).toBe(12_779_520);
    expect(estimateOutputSizeBytes({ outputWidthPx: 40, outputHeightPx: 44 })).toBe(14_417_920);
  });
});
