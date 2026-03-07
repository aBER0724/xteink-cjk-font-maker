import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPreviewModel,
  DEVICE_PROFILE,
  FONT_WEIGHT_BASE,
  FONT_WEIGHT_MAX,
  FONT_WEIGHT_MIN,
  getI18nCopy,
  estimateOutputSizeBytes,
  resolveWeightProfile,
  runWebFlow,
  SUPPORTED_LOCALES,
} from "../app.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_PREVIEW_TEXT = getI18nCopy("zh").previewTextDefault;
const CONVERSION_HISTORY_STORAGE_KEY = "xteink-conversion-history-v1";
const THEME_STORAGE_KEY = "xteink-theme-mode-v1";
const LOCALE_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];
const THEME_OPTIONS = [
  { value: "light", key: "themeLight" },
  { value: "dark", key: "themeDark" },
  { value: "system", key: "themeSystem" },
];
const CHARSET_TIER_OPTIONS = [
  { value: "6k", key: "charsetTierCompact" },
  { value: "24k", key: "charsetTierBalanced" },
  { value: "65k", key: "charsetTierFull" },
];
const DEVICE_COLOR_OPTIONS = [
  { value: "black", key: "deviceColorBlack" },
  { value: "silver", key: "deviceColorSilver" },
];
const DISPLAY_MODE_OPTIONS = [
  { value: "light", key: "displayModeLight" },
  { value: "dark", key: "displayModeDark" },
];
const LOCALE_TAG_MAP = {
  zh: "zh-CN",
  ja: "ja-JP",
  en: "en-US",
};
const DILATION_OFFSETS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
function inBounds(x, y, width, height) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function dilateMask(source, width, height, neighborBudget) {
  const next = source.slice();
  const budget = Math.max(0, Math.min(DILATION_OFFSETS.length, neighborBudget));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (source[index] === 0) {
        continue;
      }

      next[index] = 1;
      for (let i = 0; i < budget; i += 1) {
        const [ox, oy] = DILATION_OFFSETS[i];
        const nx = x + ox;
        const ny = y + oy;
        if (inBounds(nx, ny, width, height)) {
          next[ny * width + nx] = 1;
        }
      }
    }
  }

  return next;
}

function erodeMask(source, width, height, neighborThreshold) {
  const next = new Uint8Array(source.length);
  const threshold = Math.max(1, Math.min(8, neighborThreshold));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (source[index] === 0) {
        continue;
      }

      let neighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) {
            continue;
          }
          const nx = x + ox;
          const ny = y + oy;
          if (inBounds(nx, ny, width, height) && source[ny * width + nx] !== 0) {
            neighbors += 1;
          }
        }
      }

      if (neighbors >= threshold) {
        next[index] = 1;
      }
    }
  }

  return next;
}

function applyWeightMask(mask, width, height, fontWeight) {
  const profile = resolveWeightProfile(fontWeight);
  if (profile.signed === 0) {
    return mask;
  }

  let next = mask;

  if (profile.signed > 0) {
    for (let i = 0; i < profile.fullPasses; i += 1) {
      next = dilateMask(next, width, height, 8);
    }
    if (profile.fractionalPass > 0) {
      const budget = Math.max(1, Math.round(profile.fractionalPass * 8));
      next = dilateMask(next, width, height, budget);
    }
    return next;
  }

  for (let i = 0; i < profile.fullPasses; i += 1) {
    next = erodeMask(next, width, height, 5);
  }
  if (profile.fractionalPass > 0) {
    const threshold = 5 + Math.max(1, Math.round(profile.fractionalPass * 3));
    next = erodeMask(next, width, height, threshold);
  }
  return next;
}

function renderPixelPreview({
  canvas,
  text,
  fontFamily,
  fontWeight,
  fontSizePx,
  letterSpacingPx,
  lineHeightPx,
  invertDisplay,
}) {
  if (!canvas) {
    return;
  }

  const width = DEVICE_PROFILE.widthPx;
  const height = DEVICE_PROFILE.heightPx;
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }

  const safeFontSize = Math.max(8, Math.round(Number(fontSizePx) || 28));
  const safeLineHeight = Math.max(safeFontSize, Math.round(Number(lineHeightPx) || 39));
  const safeLetterSpacing = Math.max(0, Math.round(Number(letterSpacingPx) || 0));
  const paddingX = 22;
  const paddingY = 24;
  const maxX = width - paddingX;
  const maxY = height - paddingY;

  ctx.fillStyle = "#ececea";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1f2937";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${FONT_WEIGHT_BASE} ${safeFontSize}px ${fontFamily}`;

  let x = paddingX;
  let y = paddingY + safeFontSize;
  const newLine = () => {
    x = paddingX;
    y += safeLineHeight;
  };

  const lines = String(text ?? "").split("\n");
  outer: for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const ch of line) {
      const glyphWidth = Math.max(1, Math.ceil(ctx.measureText(ch).width));
      if (x + glyphWidth > maxX && x > paddingX) {
        newLine();
      }
      if (y > maxY) {
        break outer;
      }
      ctx.fillText(ch, x, y);
      x += glyphWidth + safeLetterSpacing;
    }

    if (lineIndex < lines.length - 1) {
      newLine();
      if (y > maxY) {
        break;
      }
    }
  }

  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const luminance = data[pixelIndex] * 0.299 + data[pixelIndex + 1] * 0.587 + data[pixelIndex + 2] * 0.114;
      mask[y * width + x] = luminance < 175 ? 1 : 0;
    }
  }

  const weightedMask = applyWeightMask(mask, width, height, fontWeight);
  const paperTone = invertDisplay ? 24 : 236;
  const inkTone = invertDisplay ? 238 : 36;
  for (let i = 0; i < weightedMask.length; i += 1) {
    const isInk = weightedMask[i] !== 0;
    const tone = isInk ? inkTone : paperTone;
    const pixelIndex = i * 4;
    data[pixelIndex] = tone;
    data[pixelIndex + 1] = tone;
    data[pixelIndex + 2] = tone;
    data[pixelIndex + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function formatDeviceMeta(deviceMetaPrefix) {
  return `${deviceMetaPrefix}: ${DEVICE_PROFILE.diagonalIn}\" • ${DEVICE_PROFILE.widthPx}x${DEVICE_PROFILE.heightPx} • ${DEVICE_PROFILE.ppi} ppi`;
}

function formatStatusText(copy, status) {
  switch (status.type) {
    case "idle":
      return copy.statusIdle;
    case "submitting":
      return copy.statusSubmitting;
    case "done":
      return `${copy.statusDone}: ${status.detail}`;
    case "failed":
      return `${copy.statusFailed}: ${status.detail || copy.statusUnknownError}`;
    default:
      return copy.statusIdle;
  }
}

function formatDownloadButtonText(copy, status, progressPercent) {
  if (status.type === "submitting") {
    return `${copy.downloadConverting} ${Math.min(99, Math.max(0, progressPercent))}%`;
  }
  if (status.type === "done") {
    return copy.downloadReady;
  }
  if (status.type === "failed") {
    return copy.downloadFailed;
  }
  return copy.downloadIdle;
}

function formatRelativeDate(locale, timestamp, now = Date.now()) {
  const safeNow = Math.max(now, timestamp);
  const deltaSeconds = Math.round((timestamp - safeNow) / 1000);
  const absSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(LOCALE_TAG_MAP[locale] || "en-US", {
    numeric: "auto",
  });

  if (absSeconds < 60) {
    return formatter.format(deltaSeconds, "second");
  }
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }
  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, "day");
}

function formatSizeInMb(locale, bytes) {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  return new Intl.NumberFormat(LOCALE_TAG_MAP[locale] || "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(mb);
}

function formatTierCode(tier) {
  if (tier !== "6k" && tier !== "24k" && tier !== "65k") {
    return "--";
  }
  return tier.toUpperCase();
}

function formatNumberText(value) {
  return Number.isFinite(value) ? String(value) : "--";
}

function formatNumberWithUnit(value, unit) {
  return Number.isFinite(value) ? `${value}${unit}` : "--";
}

function formatSpacingMeta(record) {
  if (!Number.isFinite(record.outputWidthPx) || !Number.isFinite(record.outputHeightPx)) {
    return "--";
  }
  return `${record.outputWidthPx}x${record.outputHeightPx}px`;
}

function triggerDownload(downloadUrl, filename) {
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  if (filename) {
    anchor.download = filename;
  }
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function createHistoryPreviewDataUrl(canvas) {
  if (!canvas || typeof document === "undefined") {
    return "";
  }

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

export function App() {
  const [locale, setLocale] = useState("zh");
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
    return "system";
  });
  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [fontFile, setFontFile] = useState(null);
  const [tier, setTier] = useState("65k");
  const [fontSizePx, setFontSizePx] = useState(28);
  const [fontWeight, setFontWeight] = useState(FONT_WEIGHT_BASE);
  const [outputWidthPx, setOutputWidthPx] = useState(33);
  const [outputHeightPx, setOutputHeightPx] = useState(39);
  const [deviceColor, setDeviceColor] = useState("black");
  const [displayMode, setDisplayMode] = useState("light");
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);
  const [status, setStatus] = useState({ type: "idle", detail: "" });
  const [progressPercent, setProgressPercent] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [conversionHistory, setConversionHistory] = useState([]);
  const [selectedHistoryPreview, setSelectedHistoryPreview] = useState(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [previewFontUrl, setPreviewFontUrl] = useState("");
  const [containerWidthPx, setContainerWidthPx] = useState(320);

  const previewShellRef = useRef(null);
  const previewViewportRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previousLocaleRef = useRef(locale);
  const copy = useMemo(() => getI18nCopy(locale), [locale]);
  const resolvedTheme = themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;
  const previewModel = useMemo(
    () =>
      buildPreviewModel({
        containerWidthPx,
        fontSizePx,
        outputWidthPx,
        outputHeightPx,
      }),
    [containerWidthPx, fontSizePx, outputWidthPx, outputHeightPx]
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => {
      setPrefersDark(event.matches);
    };
    setPrefersDark(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const node = previewViewportRef.current ?? previewShellRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      setContainerWidthPx(Math.max(1, node.clientWidth));
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(node);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updateSize);
      };
    }

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    const previousCopy = getI18nCopy(previousLocaleRef.current);
    const nextCopy = getI18nCopy(locale);
    if (previewText === previousCopy.previewTextDefault || previewText.trim() === "") {
      setPreviewText(nextCopy.previewTextDefault);
    }
    previousLocaleRef.current = locale;
  }, [locale, previewText]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.title;
  }, [locale, copy.title]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONVERSION_HISTORY_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      setConversionHistory(
        parsed.filter(
          (entry) =>
            entry &&
            typeof entry.id === "string" &&
            typeof entry.downloadUrl === "string" &&
            typeof entry.outputName === "string" &&
            typeof entry.fontName === "string" &&
            typeof entry.createdAt === "number" &&
            (entry.previewImageDataUrl === undefined || typeof entry.previewImageDataUrl === "string") &&
            (entry.tier === undefined || entry.tier === "6k" || entry.tier === "24k" || entry.tier === "65k") &&
            (entry.fontSizePx === undefined || typeof entry.fontSizePx === "number") &&
            (entry.fontWeight === undefined || typeof entry.fontWeight === "number") &&
            (entry.outputWidthPx === undefined || typeof entry.outputWidthPx === "number") &&
            (entry.outputHeightPx === undefined || typeof entry.outputHeightPx === "number")
        )
      );
    } catch {
      setConversionHistory([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CONVERSION_HISTORY_STORAGE_KEY, JSON.stringify(conversionHistory));
  }, [conversionHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedHistoryPreview) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedHistoryPreview(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedHistoryPreview]);

  useEffect(() => {
    if (!fontFile) {
      setPreviewFontUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(fontFile);
    setPreviewFontUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [fontFile]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }

    const fontFamily = previewFontUrl
      ? '"UploadedPreviewFont", "Noto Sans CJK SC", "PingFang SC", sans-serif'
      : '"Noto Sans CJK SC", "PingFang SC", sans-serif';
    let cancelled = false;

    const draw = () => {
      if (cancelled) {
        return;
      }
      renderPixelPreview({
        canvas,
        text: previewText,
        fontFamily,
        fontWeight,
        fontSizePx: previewModel.typography.fontSizePx,
        letterSpacingPx: previewModel.typography.letterSpacingPx,
        lineHeightPx: previewModel.typography.lineHeightPx,
        invertDisplay: displayMode === "dark",
      });
    };

    const renderWithFontReady = async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // noop
        }
      }

      draw();

      if (previewFontUrl && typeof document.fonts?.load === "function") {
        try {
          await document.fonts.load(
            `${FONT_WEIGHT_BASE} ${Math.max(8, Math.round(previewModel.typography.fontSizePx))}px UploadedPreviewFont`
          );
          draw();
        } catch {
          // noop
        }
      }
    };

    renderWithFontReady();

    return () => {
      cancelled = true;
    };
  }, [
    previewText,
    previewFontUrl,
    fontWeight,
    displayMode,
    previewModel.typography.fontSizePx,
    previewModel.typography.letterSpacingPx,
    previewModel.typography.lineHeightPx,
  ]);

  const statusText = useMemo(() => formatStatusText(copy, status), [copy, status]);
  const downloadButtonText = useMemo(
    () => formatDownloadButtonText(copy, status, progressPercent),
    [copy, status, progressPercent]
  );
  const estimatedSizeBytes = useMemo(
    () =>
      estimateOutputSizeBytes({
        outputWidthPx,
        outputHeightPx,
      }),
    [outputWidthPx, outputHeightPx]
  );
  const estimatedSizeText = useMemo(
    () => `${formatSizeInMb(locale, estimatedSizeBytes)} MB`,
    [estimatedSizeBytes, locale]
  );
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!fontFile) {
      setStatus({ type: "failed", detail: copy.statusFontRequired });
      return;
    }

    setStatus({ type: "submitting", detail: "" });
    setProgressPercent(0);
    setDownloadUrl("");
    setDownloadName("");

    try {
      const result = await runWebFlow({
        fileName: fontFile.name,
        fileData: fontFile,
        tier,
        fontSizePx,
        fontWeight,
        outputWidthPx,
        outputHeightPx,
        compatFlipY: true,
      }, undefined, undefined, (progress) => {
        setProgressPercent(progress.percent);
      });

      setStatus({ type: "done", detail: result.jobId });
      setProgressPercent(100);
      setDownloadUrl(result.downloadUrl);
      setDownloadName(result.outputName || `${result.jobId}.bin`);
      setNowTimestamp(Date.now());
      const historyPreviewDataUrl = createHistoryPreviewDataUrl(previewCanvasRef.current);
      setConversionHistory((previous) => [
        {
          id: result.jobId,
          fontName: fontFile.name,
          outputName: result.outputName || `${result.jobId}.bin`,
          downloadUrl: result.downloadUrl,
          previewImageDataUrl: historyPreviewDataUrl,
          tier,
          fontSizePx,
          fontWeight,
          outputWidthPx,
          outputHeightPx,
          createdAt: Date.now(),
        },
        ...previous.filter((record) => record.id !== result.jobId),
      ]);
    } catch (error) {
      setStatus({
        type: "failed",
        detail: error instanceof Error ? error.message : copy.statusUnknownError,
      });
      setProgressPercent(0);
    }
  };

  const handleDownloadClick = () => {
    if (!downloadUrl) {
      return;
    }
    triggerDownload(downloadUrl, downloadName);
  };

  const handleHistoryDownload = (record) => {
    triggerDownload(record.downloadUrl, record.outputName);
  };

  const handleHistoryDelete = (recordId) => {
    setConversionHistory((previous) => previous.filter((record) => record.id !== recordId));
  };

  const closeHistoryPreview = () => {
    setSelectedHistoryPreview(null);
  };

  return (
    <main className="min-h-screen p-4 sm:p-5 md:p-8">
      {previewFontUrl ? (
        <style>{`@font-face { font-family: "UploadedPreviewFont"; src: url("${previewFontUrl}"); }`}</style>
      ) : null}

      <div className="mx-auto w-full max-w-7xl">
        <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-2xl md:text-3xl">{copy.title}</CardTitle>
              </div>
              <div className="flex w-full items-center justify-end gap-1 overflow-x-auto whitespace-nowrap sm:w-auto sm:gap-2">
                <div className="inline-flex shrink-0 items-center rounded-full bg-muted p-1">
                  {LOCALE_OPTIONS.filter((item) => SUPPORTED_LOCALES.includes(item.value)).map((item) => {
                    const active = item.value === locale;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setLocale(item.value)}
                        aria-pressed={active}
                        title={copy.language}
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-xs transition-all duration-200 sm:px-3 sm:py-1.5 sm:text-sm ${
                          active
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="inline-flex shrink-0 items-center rounded-full bg-muted p-1">
                  {THEME_OPTIONS.map((item) => {
                    const active = themeMode === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setThemeMode(item.value)}
                        aria-pressed={active}
                        title={copy.theme}
                        className={`whitespace-nowrap rounded-full px-2 py-1 text-xs transition-all duration-200 sm:px-2.5 sm:text-sm ${
                          active
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {copy[item.key]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardHeader>
        <CardContent>
            <div className="grid min-w-0 gap-5 xl:justify-center xl:grid-cols-[380px_420px_380px]">
              <Card className="order-2 min-w-0 border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{copy.conversionSettings}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleSubmit}>
                    <div className="grid gap-2">
                      <Label htmlFor="font-file">{copy.fontFile}</Label>
                      <div className="relative">
                        <input
                          id="font-file"
                          name="font-file"
                          type="file"
                          accept=".ttf,.otf"
                          required
                          onChange={(event) => setFontFile(event.target.files?.[0] ?? null)}
                          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                        />
                        <div
                          className={`flex h-11 w-full items-center gap-2 rounded-md border px-2 text-sm transition-colors ${
                            fontFile
                              ? "border-primary/40 bg-primary/5"
                              : "border-input bg-background hover:border-ring/40 hover:bg-muted/30"
                          }`}
                        >
                          <span className="inline-flex h-8 shrink-0 items-center rounded-md bg-muted px-3.5 font-medium text-foreground">
                            {copy.chooseFile}
                          </span>
                          <span className={`min-w-0 flex-1 truncate ${fontFile ? "text-foreground" : "text-muted-foreground"}`}>
                            {fontFile ? fontFile.name : copy.noFileChosen}
                          </span>
                          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{copy.supportedFontFormats}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>{copy.charsetTier}</Label>
                      <div
                        id="tier"
                        role="group"
                        aria-label={copy.charsetTier}
                        className="inline-flex w-full items-center rounded-full bg-muted p-1"
                      >
                        {CHARSET_TIER_OPTIONS.map((item) => {
                          const active = item.value === tier;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setTier(item.value)}
                              aria-pressed={active}
                              title={copy.charsetTier}
                              className={`flex-1 rounded-full px-2.5 py-1 text-center text-xs transition-all duration-200 sm:px-3 sm:py-1.5 sm:text-sm ${
                                active
                                  ? "bg-background font-medium text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {copy[item.key]}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{copy.charsetTierCounts}</p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="font-size-px">{copy.fontSizePx}</Label>
                      <Input
                        id="font-size-px"
                        name="font-size-px"
                        type="number"
                        min={8}
                        max={64}
                        value={fontSizePx}
                        onChange={(event) => setFontSizePx(Number(event.target.value) || 0)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="font-weight">{copy.fontWeight}</Label>
                        <span className="text-sm text-muted-foreground">{fontWeight}</span>
                      </div>
                        <input
                          id="font-weight"
                          name="font-weight"
                          type="range"
                          min={FONT_WEIGHT_MIN}
                          max={FONT_WEIGHT_MAX}
                          step={5}
                          value={fontWeight}
                          onChange={(event) => setFontWeight(Number(event.target.value) || FONT_WEIGHT_BASE)}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{FONT_WEIGHT_MIN}</span>
                          <span>{FONT_WEIGHT_BASE}</span>
                          <span>{FONT_WEIGHT_MAX}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="output-width-px">{copy.outputWidthPx}</Label>
                        <Input
                          id="output-width-px"
                          name="output-width-px"
                          type="number"
                          min={8}
                          max={96}
                          value={outputWidthPx}
                          onChange={(event) => setOutputWidthPx(Number(event.target.value) || 0)}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="output-height-px">{copy.outputHeightPx}</Label>
                        <Input
                          id="output-height-px"
                          name="output-height-px"
                          type="number"
                          min={8}
                          max={128}
                          value={outputHeightPx}
                          onChange={(event) => setOutputHeightPx(Number(event.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="preview-text">{copy.previewText}</Label>
                      <Textarea
                        id="preview-text"
                        rows={9}
                        value={previewText}
                        onChange={(event) => setPreviewText(event.target.value)}
                      />
                    </div>

                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {copy.estimatedFileSize}: {estimatedSizeText}
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground/80">{copy.estimatedFileSizeHint}</p>

                    <Button type="submit" className="w-full">
                      {copy.startConversion}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-border"
                      onClick={handleDownloadClick}
                      disabled={!downloadUrl}
                    >
                      {downloadButtonText}
                    </Button>
                  </form>

                  {status.type === "failed" ? (
                    <p id="status" className="mt-4 text-sm text-muted-foreground">
                      {statusText}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="order-1 min-w-0 overflow-x-hidden border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{copy.devicePreview}</CardTitle>
                  <CardDescription id="device-meta">{formatDeviceMeta(copy.deviceMetaPrefix)}</CardDescription>
                </CardHeader>
                <CardContent className="min-w-0">
                  <div
                    id="preview-shell"
                    ref={previewShellRef}
                    className={`preview-device preview-device--${deviceColor} mx-auto mb-2 max-w-[340px]`}
                  >
                    <div className="preview-frame">
                      <div className="preview-bezel">
                        <div
                          id="preview-viewport"
                          ref={previewViewportRef}
                          className={`preview-viewport ${displayMode === "dark" ? "preview-viewport--inverted" : ""}`}
                        >
                          <canvas
                            id="preview-content"
                            ref={previewCanvasRef}
                            className="preview-content-canvas"
                            width={DEVICE_PROFILE.widthPx}
                            height={DEVICE_PROFILE.heightPx}
                            style={{
                              transform: `scale(${previewModel.scale})`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="preview-bottom-controls">
                        <span className="preview-bottom-key-groove" />
                        <span className="preview-bottom-key-groove" />
                      </div>
                    </div>
                    <span className="preview-side-key preview-side-key-top" />
                    <span className="preview-side-key preview-side-key-middle" />
                    <span className="preview-side-key preview-side-key-bottom" />
                  </div>

                  <div className="mt-8 grid grid-cols-2 justify-items-center gap-3">
                    <div className="grid w-fit gap-2">
                      <Label>{copy.deviceColor}</Label>
                      <div className="inline-flex w-fit items-center rounded-full bg-muted p-1">
                        {DEVICE_COLOR_OPTIONS.map((item) => {
                          const active = item.value === deviceColor;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setDeviceColor(item.value)}
                              aria-pressed={active}
                              title={copy.deviceColor}
                              className={`rounded-full px-2.5 py-1 text-xs transition-all duration-200 sm:px-3 sm:py-1.5 sm:text-sm ${
                                active
                                  ? "bg-background font-medium text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {copy[item.key]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid w-fit gap-2">
                      <Label>{copy.displayMode}</Label>
                      <div className="inline-flex w-fit items-center rounded-full bg-muted p-1">
                        {DISPLAY_MODE_OPTIONS.map((item) => {
                          const active = item.value === displayMode;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setDisplayMode(item.value)}
                              aria-pressed={active}
                              title={copy.displayMode}
                              className={`rounded-full px-2.5 py-1 text-xs transition-all duration-200 sm:px-3 sm:py-1.5 sm:text-sm ${
                                active
                                  ? "bg-background font-medium text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {copy[item.key]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="order-3 min-w-0 border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{copy.historyTitle}</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0">
                  {conversionHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{copy.historyEmpty}</p>
                  ) : (
                    <div className="grid min-w-0 gap-3">
                      {conversionHistory.map((record) => (
                        <div
                          key={record.id}
                          className="flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-border p-3"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="h-20 w-12 shrink-0 overflow-hidden rounded-sm border border-border bg-muted/40 md:h-24 md:w-14">
                              {record.previewImageDataUrl ? (
                                <button
                                  type="button"
                                  className="group flex h-full w-full items-center justify-center"
                                  title={copy.actionView}
                                  onClick={() =>
                                    setSelectedHistoryPreview({
                                      imageUrl: record.previewImageDataUrl,
                                      fontName: record.fontName,
                                    })
                                  }
                                >
                                  <img
                                    src={record.previewImageDataUrl}
                                    alt={record.fontName}
                                    className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.03]"
                                    loading="lazy"
                                  />
                                </button>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">Aa</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 text-sm">
                              <p className="whitespace-normal break-words" title={record.fontName}>
                                {record.fontName}
                              </p>
                              <p className="whitespace-normal break-words" title={record.outputName}>
                                {record.outputName}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5">
                                  {formatTierCode(record.tier)}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5">
                                  {formatNumberWithUnit(record.fontSizePx, "px")}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5">
                                  {formatSpacingMeta(record)}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5">
                                  {formatNumberWithUnit(record.fontWeight, "w")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-1 flex items-end justify-between gap-2">
                            <p className="mb-1 ml-1 text-xs text-muted-foreground">{formatRelativeDate(locale, record.createdAt, nowTimestamp)}</p>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-border"
                                onClick={() => handleHistoryDownload(record)}
                              >
                                {copy.actionDownload}
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => handleHistoryDelete(record.id)}>
                                {copy.actionDelete}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
        </CardContent>
      </div>

      {selectedHistoryPreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={copy.previewModalTitle}
          onClick={closeHistoryPreview}
        >
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">
                {copy.previewModalTitle}: {selectedHistoryPreview.fontName}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={closeHistoryPreview}>
                {copy.closePreview}
              </Button>
            </div>
            <div className="overflow-hidden rounded-sm border border-border bg-muted/40">
              <img
                src={selectedHistoryPreview.imageUrl}
                alt={selectedHistoryPreview.fontName}
                className="mx-auto block h-auto max-h-[85vh] w-auto max-w-full object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
