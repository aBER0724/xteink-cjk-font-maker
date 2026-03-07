export const DEVICE_PROFILE = {
  diagonalIn: 4.0,
  widthPx: 480,
  heightPx: 800,
  ppi: 233,
};

export const SUPPORTED_LOCALES = ["zh", "ja", "en"];
const DEFAULT_PREVIEW_TEXT = `中文测试：你好，世界！这是字符集显示检查，包含常用标点：。，、；：？！“”（）【】《》—…以及数字0123456789，日期2026-02-26，金额￥123.45。
日本語テスト：こんにちは、世界！文字化け確認です。ひらがな・カタカナ：あいうえお／アイウエオ。漢字：東京、大阪、学校。記号：・「」『』〜。
English test: Hello, world! Charset check: ABC abc 123, symbols: !@#$%^&*()_+-=[]{};:’”,.<>/? \\ |.`;

export const I18N_COPY = {
  zh: {
    language: "语言",
    title: "CJK 字体转换器",
    description: "生成兼容 crosspoint-reader-cjk 的二进制字体。",
    conversionSettings: "参数",
    theme: "主题",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    fontFile: "字体文件",
    chooseFile: "选择文件",
    noFileChosen: "未选择文件",
    supportedFontFormats: "支持 .ttf / .otf",
    charsetTier: "字符集",
    selectTier: "选择等级",
    charsetTierCompact: "精简",
    charsetTierBalanced: "平衡",
    charsetTierFull: "完整",
    charsetTierCounts: "字符数：精简 6,000；平衡 24,000；完整 65,536 (BMP)",
    estimatedFileSize: "预计大小",
    estimatedFileSizeHint: "固定 BMP 65,536 字符槽位，大小由字间距和行间距决定",
    fontSizePx: "字号 (px)",
    fontWeight: "字重",
    outputWidthPx: "字间距 (px)",
    outputHeightPx: "行间距 (px)",
    compatFlipY: "XTEink 兼容模式：翻转 Y 轴",
    startConversion: "开始转换",
    statusIdle: "空闲",
    statusSubmitting: "正在提交转换任务...",
    statusDone: "完成",
    statusFailed: "失败",
    statusFontRequired: "需要先选择字体文件",
    statusUnknownError: "未知错误",
    downloadConvertedBin: "下载转换后的 Bin",
    downloadIdle: "空闲",
    downloadConverting: "转换中",
    downloadReady: "下载字体",
    downloadFailed: "转换失败",
    historyTitle: "转换记录",
    historyEmpty: "暂无转换记录",
    historyPreview: "预览",
    historyFile: "字体",
    historyOutput: "输出",
    historyWhen: "时间",
    actionView: "查看",
    actionDownload: "下载",
    actionDelete: "删除",
    previewModalTitle: "字体预览",
    closePreview: "关闭",
    devicePreview: "设备预览",
    deviceColor: "机身颜色",
    deviceColorBlack: "黑色",
    deviceColorSilver: "灰色",
    displayMode: "显示模式",
    displayModeLight: "浅色",
    displayModeDark: "深色",
    deviceMetaPrefix: "设备",
    previewText: "预览文本",
    previewTextDefault: DEFAULT_PREVIEW_TEXT,
  },
  ja: {
    language: "言語",
    title: "CJK フォントコンバーター",
    description: "crosspoint-reader-cjk 互換のバイナリフォントを生成します。",
    conversionSettings: "設定",
    theme: "テーマ",
    themeLight: "ライト",
    themeDark: "ダーク",
    themeSystem: "システム",
    fontFile: "フォントファイル",
    chooseFile: "ファイルを選択",
    noFileChosen: "ファイルが選択されていません",
    supportedFontFormats: "対応形式 .ttf / .otf",
    charsetTier: "文字セット",
    selectTier: "文字セットを選択",
    charsetTierCompact: "軽量",
    charsetTierBalanced: "バランス",
    charsetTierFull: "完全",
    charsetTierCounts: "文字数: 軽量 6,000 / バランス 24,000 / 完全 65,536 (BMP)",
    estimatedFileSize: "推定ファイルサイズ",
    estimatedFileSizeHint: "BMP 65,536 スロット固定。サイズは字間隔と行間隔で決まります",
    fontSizePx: "フォントサイズ (px)",
    fontWeight: "字重",
    outputWidthPx: "字間隔 (px)",
    outputHeightPx: "行間隔 (px)",
    compatFlipY: "XTEink 互換: Y 軸を反転",
    startConversion: "変換開始",
    statusIdle: "待機中",
    statusSubmitting: "変換ジョブを送信中...",
    statusDone: "完了",
    statusFailed: "失敗",
    statusFontRequired: "先にフォントファイルを選択してください",
    statusUnknownError: "不明なエラー",
    downloadConvertedBin: "変換済み Bin をダウンロード",
    downloadIdle: "IDLE",
    downloadConverting: "変換中",
    downloadReady: "フォントをダウンロード",
    downloadFailed: "変換失敗",
    historyTitle: "変換履歴",
    historyEmpty: "変換履歴はまだありません",
    historyPreview: "プレビュー",
    historyFile: "フォント",
    historyOutput: "出力",
    historyWhen: "時刻",
    actionView: "表示",
    actionDownload: "ダウンロード",
    actionDelete: "削除",
    previewModalTitle: "フォントプレビュー",
    closePreview: "閉じる",
    devicePreview: "デバイスプレビュー",
    deviceColor: "筐体カラー",
    deviceColorBlack: "ブラック",
    deviceColorSilver: "グレー",
    displayMode: "表示モード",
    displayModeLight: "ライト",
    displayModeDark: "ダーク",
    deviceMetaPrefix: "デバイス",
    previewText: "プレビューテキスト",
    previewTextDefault: DEFAULT_PREVIEW_TEXT,
  },
  en: {
    language: "Language",
    title: "CJK Font Converter",
    description: "Generate crosspoint-reader-cjk compatible binary fonts.",
    conversionSettings: "Settings",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    fontFile: "Font file",
    chooseFile: "Choose File",
    noFileChosen: "No file chosen",
    supportedFontFormats: "Supports .ttf / .otf",
    charsetTier: "Charset",
    selectTier: "Select tier",
    charsetTierCompact: "Compact",
    charsetTierBalanced: "Balanced",
    charsetTierFull: "Full",
    charsetTierCounts: "Character count: Compact 6,000 / Balanced 24,000 / Full 65,536 (BMP)",
    estimatedFileSize: "Est. size",
    estimatedFileSizeHint: "Fixed 65,536 BMP slots; size depends on letter and line spacing",
    fontSizePx: "Size (px)",
    fontWeight: "Weight",
    outputWidthPx: "Letter spacing (px)",
    outputHeightPx: "Line spacing (px)",
    compatFlipY: "XTEink compatibility: flip Y axis",
    startConversion: "Start Conversion",
    statusIdle: "Idle",
    statusSubmitting: "Submitting conversion job...",
    statusDone: "Done",
    statusFailed: "Failed",
    statusFontRequired: "font file is required",
    statusUnknownError: "unknown error",
    downloadConvertedBin: "Download Converted Bin",
    downloadIdle: "IDLE",
    downloadConverting: "Converting",
    downloadReady: "Download Font",
    downloadFailed: "Failed",
    historyTitle: "Conversion History",
    historyEmpty: "No conversion records yet",
    historyPreview: "Preview",
    historyFile: "Font",
    historyOutput: "Output",
    historyWhen: "When",
    actionView: "View",
    actionDownload: "Download",
    actionDelete: "Delete",
    previewModalTitle: "Font Preview",
    closePreview: "Close",
    devicePreview: "Device Preview",
    deviceColor: "Device color",
    deviceColorBlack: "Black",
    deviceColorSilver: "Gray",
    displayMode: "Display mode",
    displayModeLight: "Light",
    displayModeDark: "Dark",
    deviceMetaPrefix: "Device",
    previewText: "Preview text",
    previewTextDefault: DEFAULT_PREVIEW_TEXT,
  },
};

export function normalizeLocale(locale) {
  if (typeof locale !== "string") {
    return "zh";
  }

  const candidate = locale.toLowerCase().trim();
  if (SUPPORTED_LOCALES.includes(candidate)) {
    return candidate;
  }
  return "zh";
}

export function getI18nCopy(locale) {
  const normalized = normalizeLocale(locale);
  return I18N_COPY[normalized] || I18N_COPY.zh;
}

export const FONT_WEIGHT_MIN = 300;
export const FONT_WEIGHT_MAX = 650;
export const FONT_WEIGHT_BASE = 400;
export const BMP_SLOT_COUNT = 0x10000;
const MAX_WEIGHT_PASSES = 1.6;

export function estimateOutputSizeBytes({ outputWidthPx, outputHeightPx }) {
  const width = Math.max(1, Math.round(Number(outputWidthPx) || 1));
  const height = Math.max(1, Math.round(Number(outputHeightPx) || 1));
  const bytesPerGlyph = Math.ceil(width / 8) * height;
  return bytesPerGlyph * BMP_SLOT_COUNT;
}

export function buildPreviewModel({
  containerWidthPx,
  fontSizePx,
  outputWidthPx,
  outputHeightPx,
}) {
  const scale = Math.min(1, containerWidthPx / DEVICE_PROFILE.widthPx);
  return {
    scale,
    viewportCssWidthPx: DEVICE_PROFILE.widthPx * scale,
    viewportCssHeightPx: DEVICE_PROFILE.heightPx * scale,
    typography: {
      fontSizePx,
      letterSpacingPx: Math.max(0, outputWidthPx - fontSizePx),
      lineHeightPx: outputHeightPx,
    },
    physical: {
      widthIn: DEVICE_PROFILE.widthPx / DEVICE_PROFILE.ppi,
      heightIn: DEVICE_PROFILE.heightPx / DEVICE_PROFILE.ppi,
      diagonalIn: DEVICE_PROFILE.diagonalIn,
    },
  };
}

export function resolveWeightProfile(fontWeight) {
  if (!Number.isFinite(fontWeight)) {
    return {
      signed: 0,
      fullPasses: 0,
      fractionalPass: 0,
    };
  }

  const clamped = Math.min(FONT_WEIGHT_MAX, Math.max(FONT_WEIGHT_MIN, Number(fontWeight)));
  const delta = clamped - FONT_WEIGHT_BASE;
  if (delta === 0) {
    return {
      signed: 0,
      fullPasses: 0,
      fractionalPass: 0,
    };
  }

  const maxDelta = delta > 0 ? FONT_WEIGHT_MAX - FONT_WEIGHT_BASE : FONT_WEIGHT_BASE - FONT_WEIGHT_MIN;
  const normalized = Math.min(1, Math.abs(delta) / maxDelta);
  const passStrength = normalized * MAX_WEIGHT_PASSES;
  const fullPasses = Math.floor(passStrength);
  const fractionalPass = passStrength - fullPasses;

  return {
    signed: delta > 0 ? 1 : -1,
    fullPasses,
    fractionalPass,
  };
}

export async function defaultApiRequest(path, init) {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`api request failed: ${path} (${response.status})`);
  }
  return response.json();
}

export async function defaultBinaryUpload(url, file) {
  if (!file) {
    return;
  }

  const getLegacyUploadUrl = (rawUrl) => {
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "https://example.com";
      const parsed = new URL(rawUrl, base);
      if (parsed.pathname !== "/api/uploads") {
        return null;
      }

      const objectKey = parsed.searchParams.get("object_key");
      if (!objectKey) {
        return null;
      }

      return `/api/uploads/${encodeURIComponent(objectKey)}`;
    } catch {
      return null;
    }
  };

  const attempts = [
    { url, method: "PUT" },
    { url, method: "POST" },
  ];

  const legacyUrl = getLegacyUploadUrl(url);
  if (legacyUrl && legacyUrl !== url) {
    attempts.push({ url: legacyUrl, method: "PUT" });
    attempts.push({ url: legacyUrl, method: "POST" });
  }

  let lastStatus = 0;
  let firstAttempt = true;
  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: attempt.method,
      body: file,
    });

    if (response.ok) {
      return;
    }

    lastStatus = response.status;
    if (firstAttempt && response.status !== 404 && response.status !== 405) {
      break;
    }
    firstAttempt = false;
  }

  throw new Error(`binary upload failed (${lastStatus || 0})`);
}

export async function runWebFlow(
  input,
  apiRequest = defaultApiRequest,
  binaryUpload = defaultBinaryUpload,
  onProgress = null
) {
  let lastPercent = 0;
  const emitProgress = (phase, percent) => {
    if (!onProgress) {
      return;
    }
    const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
    const nextPercent = Math.max(lastPercent, safePercent);
    lastPercent = nextPercent;
    onProgress({ phase, percent: nextPercent });
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  emitProgress("request-upload-url", 0);
  const uploadMeta = await apiRequest("/api/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_name: input.fileName }),
  });
  emitProgress("uploading-font", 0);
  await binaryUpload(uploadMeta.upload_url, input.fileData);
  emitProgress("creating-job", 0);

  const created = await apiRequest("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      font_object_key: uploadMeta.object_key,
      tier: input.tier,
      font_size_px: input.fontSizePx,
      font_weight: input.fontWeight ?? 400,
      output_width_px: input.outputWidthPx,
      output_height_px: input.outputHeightPx,
      compat_flip_y: input.compatFlipY,
      font_name: input.fileName,
    }),
  });

  const jobId = created.job_id;
  let completed = false;
  const maxAttempts = 600;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const state = await apiRequest(`/api/jobs/${jobId}`);
    const percent = state && state.progress && typeof state.progress.percent === "number" ? state.progress.percent : null;
    const phase = state && state.progress && typeof state.progress.phase === "string" ? state.progress.phase : "polling";
    if (percent !== null) {
      emitProgress(phase, percent);
    }
    if (state.status === "done") {
      completed = true;
      break;
    }
    if (state.status === "failed") {
      throw new Error(state.error_message || "job failed");
    }
    await sleep(300);
  }

  if (!completed) {
    throw new Error("job timeout");
  }

  emitProgress("fetching-download", 99);
  const download = await apiRequest(`/api/jobs/${jobId}/download`);
  emitProgress("done", 100);
  return {
    jobId,
    downloadUrl: download.download_url,
    outputName: download.output_name,
  };
}
