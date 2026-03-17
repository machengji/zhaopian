const sourceInput = document.getElementById("sourceInput");
const targetInput = document.getElementById("targetInput");
const sourceThumb = document.getElementById("sourceThumb");
const targetThumb = document.getElementById("targetThumb");
const processBtn = document.getElementById("processBtn");
const downloadBtn = document.getElementById("downloadBtn");
const exportPresetBtn = document.getElementById("exportPresetBtn");
const applyPresetBtn = document.getElementById("applyPresetBtn");
const xmpResetBtn = document.getElementById("xmpResetBtn");
const xmpPreviewHint = document.getElementById("xmpPreviewHint");
const xmpPreviewText = document.getElementById("xmpPreviewText");
const xmpFujiPreset = document.getElementById("xmpFujiPreset");
const xmpFujiStrengthRange = document.getElementById("xmpFujiStrengthRange");
const xmpFujiStrengthValue = document.getElementById("xmpFujiStrengthValue");
const xmpExposureRange = document.getElementById("xmpExposureRange");
const xmpExposureValue = document.getElementById("xmpExposureValue");
const xmpTemperatureRange = document.getElementById("xmpTemperatureRange");
const xmpTemperatureValue = document.getElementById("xmpTemperatureValue");
const xmpTintRange = document.getElementById("xmpTintRange");
const xmpTintValue = document.getElementById("xmpTintValue");
const xmpHslChannel = document.getElementById("xmpHslChannel");
const xmpHslHueRange = document.getElementById("xmpHslHueRange");
const xmpHslHueValue = document.getElementById("xmpHslHueValue");
const xmpHslSaturationRange = document.getElementById("xmpHslSaturationRange");
const xmpHslSaturationValue = document.getElementById("xmpHslSaturationValue");
const xmpHslLuminanceRange = document.getElementById("xmpHslLuminanceRange");
const xmpHslLuminanceValue = document.getElementById("xmpHslLuminanceValue");
const statusText = document.getElementById("statusText");
const statsText = document.getElementById("statsText");
const algorithmSelect = document.getElementById("algorithmSelect");
const presetSelect = document.getElementById("presetSelect");
const qualitySelect = document.getElementById("qualitySelect");
const recommendBtn = document.getElementById("recommendBtn");
const strengthRange = document.getElementById("strengthRange");
const strengthValue = document.getElementById("strengthValue");
const saturationRange = document.getElementById("saturationRange");
const saturationValue = document.getElementById("saturationValue");
const lumaPreserveRange = document.getElementById("lumaPreserveRange");
const lumaPreserveValue = document.getElementById("lumaPreserveValue");
const invertToggle = document.getElementById("invertToggle");
const hqExportToggle = document.getElementById("hqExportToggle");
const compareSlider = document.getElementById("compareSlider");
const afterLayer = document.getElementById("afterLayer");
const beforeCanvas = document.getElementById("beforeCanvas");
const afterCanvas = document.getElementById("afterCanvas");
const beforeCtx = beforeCanvas.getContext("2d", { willReadFrequently: true });
const afterCtx = afterCanvas.getContext("2d", { willReadFrequently: true });

const QUALITY_PROFILES = {
  mobile: {
    previewMaxPixels: 780000,
    sourceMaxPixels: 620000,
    exportMaxPixels: 1800000,
    robustTrim: 0.025,
  },
  balanced: {
    previewMaxPixels: 1500000,
    sourceMaxPixels: 900000,
    exportMaxPixels: 4800000,
    robustTrim: 0.02,
  },
  pro: {
    previewMaxPixels: 2500000,
    sourceMaxPixels: 1500000,
    exportMaxPixels: 12000000,
    robustTrim: 0.015,
  },
};

const PRESET_LIBRARY = {
  none: { name: "无预设", contrast: 1.0, lBias: 0, aScale: 1.0, bScale: 1.0, aBias: 0, bBias: 0 },
  film: { name: "胶片柔和", contrast: 0.94, lBias: 1.2, aScale: 0.95, bScale: 0.92, aBias: 0.8, bBias: 2.4 },
  cinematic: { name: "电影青橙", contrast: 1.06, lBias: -1.6, aScale: 0.9, bScale: 1.14, aBias: -4.4, bBias: 6.6 },
  ecom: { name: "电商清透", contrast: 1.04, lBias: 2.2, aScale: 0.88, bScale: 0.9, aBias: 0, bBias: 1.1 },
  social: { name: "社媒高对比", contrast: 1.11, lBias: -0.8, aScale: 1.1, bScale: 1.08, aBias: 1.2, bBias: 3.2 },
};

const XMP_HSL_CHANNELS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];

const state = {
  sourceImg: null,
  targetImg: null,
  sourceFileName: "",
  targetFileName: "",
  sourceThumbUrl: null,
  targetThumbUrl: null,
  outputBlobUrl: null,
  latestTransfer: null,
  xmpGenerator: typeof window.XMPGenerator === "function" ? new window.XMPGenerator() : null,
  xmpBaseSettings: null,
  xmpManualSettings: null,
  xmpHslChannel: "orange",
  xmpFujiPreset: "none",
  xmpFujiStrength: 1,
  worker: null,
  workerJobs: new Map(),
  nextJobId: 1,
  fullRenderPromise: null,
  fullRenderReady: false,
};

sourceInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  state.sourceImg = await fileToImage(file);
  state.sourceFileName = file.name;
  invalidateLatestTransfer();
  setThumbPreview("source", file);
  setStatus("参考图已加载");
});

targetInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  state.targetImg = await fileToImage(file);
  state.targetFileName = file.name;
  invalidateLatestTransfer();
  setThumbPreview("target", file);
  drawScaledImage(state.targetImg, beforeCanvas, beforeCtx, QUALITY_PROFILES.mobile.previewMaxPixels);
  drawScaledImage(state.targetImg, afterCanvas, afterCtx, QUALITY_PROFILES.mobile.previewMaxPixels);
  setStatus("目标图已加载，可开始迁移");
});

compareSlider.addEventListener("input", () => {
  afterLayer.style.width = `${compareSlider.value}%`;
});

strengthRange.addEventListener("input", syncUiOutputs);
saturationRange.addEventListener("input", syncUiOutputs);
lumaPreserveRange.addEventListener("input", syncUiOutputs);
xmpFujiPreset?.addEventListener("change", () => {
  state.xmpFujiPreset = xmpFujiPreset.value || "none";
  applyFujiPresetToManual();
});
xmpFujiStrengthRange?.addEventListener("input", () => {
  const ratio = Number(xmpFujiStrengthRange.value) / 100;
  state.xmpFujiStrength = clampNum(ratio, 0, 1);
  syncXmpFujiControls();
  applyFujiPresetToManual();
});
xmpExposureRange?.addEventListener("input", () => {
  updateXmpBasicSetting("exposure", Number(xmpExposureRange.value));
});
xmpTemperatureRange?.addEventListener("input", () => {
  updateXmpBasicSetting("temperature", Number(xmpTemperatureRange.value));
});
xmpTintRange?.addEventListener("input", () => {
  updateXmpBasicSetting("tint", Number(xmpTintRange.value));
});
xmpHslChannel?.addEventListener("change", () => {
  state.xmpHslChannel = xmpHslChannel.value || "orange";
  syncXmpHslControls();
  renderXmpPreview();
});
xmpHslHueRange?.addEventListener("input", () => {
  updateXmpHslSetting("hue", Number(xmpHslHueRange.value));
});
xmpHslSaturationRange?.addEventListener("input", () => {
  updateXmpHslSetting("saturation", Number(xmpHslSaturationRange.value));
});
xmpHslLuminanceRange?.addEventListener("input", () => {
  updateXmpHslSetting("luminance", Number(xmpHslLuminanceRange.value));
});
xmpResetBtn?.addEventListener("click", () => {
  resetXmpAdjustments();
});
applyPresetBtn?.addEventListener("click", async () => {
  await applyCurrentPresetToImage();
});

recommendBtn.addEventListener("click", async () => {
  if (!state.sourceImg || !state.targetImg) {
    setStatus("请先上传参考图和目标图", true);
    return;
  }
  setStatus("正在分析图片并给出推荐配置...");
  const recommendation = await recommendConfig(state.sourceImg, state.targetImg);
  applyRecommendation(recommendation);
  setStatus(`AI 推荐已应用：${recommendation.reason}`);
});

processBtn.addEventListener("click", async () => {
  if (!state.sourceImg || !state.targetImg) {
    setStatus("请先上传参考图和目标图", true);
    return;
  }

  processBtn.disabled = true;
  downloadBtn.disabled = true;
  invalidateLatestTransfer();
  state.fullRenderPromise = null;
  state.fullRenderReady = false;

  try {
    const options = getProcessOptions();
    const profile = QUALITY_PROFILES[qualitySelect.value] ?? QUALITY_PROFILES.balanced;

    setStatus("正在生成快速预览...");
    const previewResult = await runTransferPass(options, {
      sourceMaxPixels: profile.sourceMaxPixels,
      targetMaxPixels: profile.previewMaxPixels,
      robustTrim: profile.robustTrim,
      progressPrefix: "预览迁移",
    });

    drawImageData(previewResult.targetImageData, beforeCanvas, beforeCtx);
    drawImageData(previewResult.outputImageData, afterCanvas, afterCtx);
    afterLayer.style.width = `${compareSlider.value}%`;
    statsText.textContent = renderStats(previewResult, options, "preview");
    state.latestTransfer = {
      stats: previewResult.stats,
      options,
      createdAt: Date.now(),
    };
    initializeXmpFromLatestTransfer();

    await setDownloadFromImageData(previewResult.outputImageData);
    downloadBtn.disabled = false;
    exportPresetBtn.disabled = !state.xmpGenerator || !state.xmpManualSettings;
    setStatus("预览完成，可直接下载；若开启高清导出会在后台继续生成");

    if (hqExportToggle.checked) {
      state.fullRenderPromise = runHighQualityExport(options, profile).catch((error) => {
        setStatus(`高清导出失败，已保留预览下载：${error.message}`, true);
        throw error;
      });
    }
  } catch (error) {
    setStatus(`处理失败：${error.message}`, true);
  } finally {
    processBtn.disabled = false;
  }
});

downloadBtn.addEventListener("click", async () => {
  if (state.fullRenderPromise && !state.fullRenderReady) {
    downloadBtn.disabled = true;
    setStatus("高清结果生成中，请稍候...");
    try {
      await state.fullRenderPromise;
    } catch (error) {
      setStatus(`高清导出失败，已回退预览下载：${error.message}`, true);
    } finally {
      downloadBtn.disabled = false;
    }
  }

  if (!state.outputBlobUrl) {
    setStatus("当前没有可下载结果，请先迁移", true);
    return;
  }

  const link = document.createElement("a");
  link.href = state.outputBlobUrl;
  link.download = `toneport-${Date.now()}.png`;
  link.click();
});

exportPresetBtn.addEventListener("click", () => {
  if (!state.latestTransfer) {
    setStatus("请先完成一次迁移，再生成 LR 预设", true);
    return;
  }
  if (!state.xmpGenerator) {
    setStatus("XMP generator 未加载，请刷新页面后重试", true);
    return;
  }

  try {
    const presetName = buildPresetName(state.latestTransfer.options);
    if (!state.xmpManualSettings) {
      initializeXmpFromLatestTransfer();
    }
    if (!state.xmpManualSettings) {
      throw new Error("No XMP settings available");
    }
    const settings = { ...state.xmpManualSettings };
    const xmpContent = state.xmpGenerator.generateXMP(settings, presetName);

    const fileName = `${sanitizeFileStem(presetName)}.xmp`;
    downloadTextFile(fileName, xmpContent, "application/rdf+xml");
    setStatus(`LR 预设已导出：${fileName}`);
    statsText.textContent += `\n\n[xmp] Exposure=${settings.exposure.toFixed(2)}, Temp=${Math.round(settings.temperature)}, Tint=${Math.round(settings.tint)}`;
  } catch (error) {
    setStatus(`生成 LR 预设失败: ${error.message}`, true);
  }
});

window.addEventListener("beforeunload", () => {
  if (state.sourceThumbUrl) URL.revokeObjectURL(state.sourceThumbUrl);
  if (state.targetThumbUrl) URL.revokeObjectURL(state.targetThumbUrl);
  if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
  if (state.worker) state.worker.terminate();
});

function ensureWorker() {
  if (state.worker) return state.worker;
  if (typeof Worker === "undefined") {
    throw new Error("当前浏览器不支持 Worker，建议升级浏览器");
  }
  const worker = new Worker("./worker.js");
  worker.addEventListener("message", (event) => {
    const message = event.data ?? {};
    const job = state.workerJobs.get(message.id);
    if (!job) return;
    if (message.type === "progress") {
      if (job.onProgress) job.onProgress(message.progress ?? 0);
      return;
    }
    if (message.type === "done") {
      state.workerJobs.delete(message.id);
      job.resolve(message.payload);
      return;
    }
    if (message.type === "error") {
      state.workerJobs.delete(message.id);
      job.reject(new Error(message.error || "Worker 处理失败"));
    }
  });
  state.worker = worker;
  return worker;
}

function postWorkerTransfer(payload, onProgress) {
  const worker = ensureWorker();
  const id = state.nextJobId++;
  return new Promise((resolve, reject) => {
    state.workerJobs.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type: "transfer", payload }, [payload.source.buffer, payload.target.buffer]);
  });
}

async function runTransferPass(options, profile) {
  await nextFrame();
  const sourceImageData = createScaledImageData(state.sourceImg, profile.sourceMaxPixels);
  const targetImageData = createScaledImageData(state.targetImg, profile.targetMaxPixels);
  const workerSource = new Uint8ClampedArray(sourceImageData.data);
  const workerTarget = new Uint8ClampedArray(targetImageData.data);

  const start = performance.now();
  const result = await postWorkerTransfer(
    {
      source: {
        width: sourceImageData.width,
        height: sourceImageData.height,
        buffer: workerSource.buffer,
      },
      target: {
        width: targetImageData.width,
        height: targetImageData.height,
        buffer: workerTarget.buffer,
      },
      options: {
        ...options,
        robustTrim: profile.robustTrim,
      },
    },
    (progress) => {
      const pct = Math.round(progress * 100);
      setStatus(`${profile.progressPrefix}：${pct}%`);
    }
  );
  const durationMs = performance.now() - start;

  return {
    width: result.width,
    height: result.height,
    outputImageData: new ImageData(new Uint8ClampedArray(result.buffer), result.width, result.height),
    targetImageData,
    stats: result.stats,
    durationMs,
  };
}

async function runHighQualityExport(options, qualityProfile) {
  try {
    setStatus("后台生成高清下载中...");
    const exportResult = await runTransferPass(options, {
      sourceMaxPixels: Math.min(qualityProfile.sourceMaxPixels * 1.4, 1800000),
      targetMaxPixels: qualityProfile.exportMaxPixels,
      robustTrim: qualityProfile.robustTrim,
      progressPrefix: "高清导出",
    });
    await setDownloadFromImageData(exportResult.outputImageData);
    state.fullRenderReady = true;
    setStatus("高清结果已就绪，可下载");
    statsText.textContent += `\n\n[高清] ${exportResult.width}x${exportResult.height}, ${exportResult.durationMs.toFixed(0)}ms`;
  } catch (error) {
    throw error;
  }
}

function getProcessOptions() {
  return {
    mode: algorithmSelect.value,
    presetKey: presetSelect.value,
    preset: PRESET_LIBRARY[presetSelect.value] ?? PRESET_LIBRARY.none,
    strength: Number(strengthRange.value) / 100,
    saturation: Number(saturationRange.value) / 100,
    lumaPreserve: Number(lumaPreserveRange.value) / 100,
    invert: invertToggle.checked,
  };
}

function createScaledImageData(image, maxPixels) {
  const { width, height } = fitByMaxPixels(image.naturalWidth, image.naturalHeight, maxPixels);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function drawScaledImage(image, canvas, ctx, maxPixels) {
  const { width, height } = fitByMaxPixels(image.naturalWidth, image.naturalHeight, maxPixels);
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}

function drawImageData(imageData, canvas, ctx) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
}

function fitByMaxPixels(width, height, maxPixels) {
  if (!maxPixels || width * height <= maxPixels) {
    return { width, height };
  }
  const scale = Math.sqrt(maxPixels / (width * height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function setDownloadFromImageData(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  const blobUrl = await canvasToObjectUrl(canvas);
  if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
  state.outputBlobUrl = blobUrl;
}

function canvasToObjectUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("导出结果失败"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

function invalidateLatestTransfer() {
  state.latestTransfer = null;
  state.xmpBaseSettings = null;
  state.xmpManualSettings = null;
  exportPresetBtn.disabled = true;
  if (state.targetImg && state.xmpGenerator) {
    initializeXmpDefaultsForTarget();
    return;
  }
  setXmpControlsEnabled(false);
  renderXmpPreview();
}

function buildPresetName(options) {
  const sourceStem = stripFileExtension(state.sourceFileName || "source");
  const targetStem = stripFileExtension(state.targetFileName || "target");
  const mode = options?.mode || "reinhard";
  const preset = options?.presetKey || "none";
  const timestamp = new Date().toISOString().slice(0, 10);
  return `TonePort-${mode}-${preset}-${sourceStem}-to-${targetStem}-${timestamp}`;
}

function stripFileExtension(fileName) {
  return String(fileName).replace(/\.[^.]+$/, "");
}

function sanitizeFileStem(fileName) {
  const cleaned = String(fileName)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 96) || `toneport-preset-${Date.now()}`;
}

function downloadTextFile(fileName, text, mimeType) {
  const blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function initializeXmpFromLatestTransfer() {
  if (!state.latestTransfer || !state.xmpGenerator) {
    setXmpControlsEnabled(false);
    renderXmpPreview();
    return;
  }

  const presetName = buildPresetName(state.latestTransfer.options);
  const { settings } = state.xmpGenerator.generateFromTransfer({
    sourceStats: state.latestTransfer.stats.source,
    targetStats: state.latestTransfer.stats.target,
    sourceAB: state.latestTransfer.stats.sourceAB,
    targetAB: state.latestTransfer.stats.targetAB,
    options: state.latestTransfer.options,
    presetName,
  });

  state.xmpBaseSettings = { ...settings };
  state.xmpManualSettings = { ...settings };
  if (!XMP_HSL_CHANNELS.includes(state.xmpHslChannel)) {
    state.xmpHslChannel = "orange";
  }
  state.xmpFujiPreset = xmpFujiPreset?.value || state.xmpFujiPreset || "none";
  state.xmpFujiStrength = clampNum(Number(xmpFujiStrengthRange?.value || 100) / 100, 0, 1);
  applyFujiPresetToManual(false);
  setXmpControlsEnabled(true);
  syncXmpControls();
  renderXmpPreview();
}

function initializeXmpDefaultsForTarget() {
  if (!state.targetImg || !state.xmpGenerator) {
    setXmpControlsEnabled(false);
    renderXmpPreview();
    return;
  }
  state.xmpBaseSettings = createNeutralXmpSettings();
  state.xmpManualSettings = { ...state.xmpBaseSettings };
  state.xmpFujiPreset = xmpFujiPreset?.value || state.xmpFujiPreset || "none";
  state.xmpFujiStrength = clampNum(Number(xmpFujiStrengthRange?.value || 100) / 100, 0, 1);
  applyFujiPresetToManual(false);
  setXmpControlsEnabled(true);
  syncXmpControls();
  renderXmpPreview();
}

function resetXmpAdjustments() {
  if (!state.xmpBaseSettings) return;
  applyFujiPresetToManual(false);
  syncXmpControls();
  renderXmpPreview();
  setStatus("XMP parameters reset to auto values");
}

function updateXmpBasicSetting(key, rawValue) {
  if (!state.xmpManualSettings) return;
  let nextValue = Number(rawValue);
  if (!Number.isFinite(nextValue)) return;

  if (key === "exposure") nextValue = clampNum(nextValue, -5, 5);
  if (key === "temperature") nextValue = clampNum(Math.round(nextValue / 50) * 50, 2000, 50000);
  if (key === "tint") nextValue = clampNum(Math.round(nextValue), -150, 150);

  state.xmpManualSettings[key] = nextValue;
  syncXmpBasicControls();
  renderXmpPreview();
}

function updateXmpHslSetting(kind, rawValue) {
  if (!state.xmpManualSettings) return;
  const keys = getXmpHslKeys(state.xmpHslChannel);
  const value = clampNum(Math.round(Number(rawValue)), -100, 100);
  if (!Number.isFinite(value)) return;

  if (kind === "hue") state.xmpManualSettings[keys.hue] = value;
  if (kind === "saturation") state.xmpManualSettings[keys.saturation] = value;
  if (kind === "luminance") state.xmpManualSettings[keys.luminance] = value;

  syncXmpHslControls();
  renderXmpPreview();
}

function applyFujiPresetToManual(shouldSyncControls = true) {
  if (!state.xmpBaseSettings) return;
  const base = { ...state.xmpBaseSettings };
  const generator = state.xmpGenerator;
  if (generator && typeof generator.applyFujiPreset === "function") {
    state.xmpManualSettings = generator.applyFujiPreset(base, state.xmpFujiPreset, state.xmpFujiStrength);
  } else {
    state.xmpManualSettings = base;
  }
  if (shouldSyncControls) {
    syncXmpControls();
  }
  renderXmpPreview();
}

async function applyCurrentPresetToImage() {
  if (!state.targetImg) {
    setStatus("请先上传目标图，再应用预设", true);
    return;
  }
  if (!state.xmpGenerator) {
    setStatus("XMP generator 未加载，请刷新页面后重试", true);
    return;
  }

  if (!state.xmpManualSettings) {
    initializeXmpDefaultsForTarget();
  }
  if (!state.xmpManualSettings) {
    setStatus("预设参数尚未初始化，请重试", true);
    return;
  }

  const profile = QUALITY_PROFILES[qualitySelect.value] ?? QUALITY_PROFILES.balanced;
  applyPresetBtn.disabled = true;
  setStatus("正在应用预设到目标图...");
  try {
    await nextFrame();
    const targetImageData = createScaledImageData(state.targetImg, profile.previewMaxPixels);
    const outputImageData = applyXmpSettingsToImageData(targetImageData, state.xmpManualSettings);

    drawImageData(targetImageData, beforeCanvas, beforeCtx);
    drawImageData(outputImageData, afterCanvas, afterCtx);
    afterLayer.style.width = `${compareSlider.value}%`;

    await setDownloadFromImageData(outputImageData);
    downloadBtn.disabled = false;
    setStatus("预设已应用，可直接预览和下载结果");
    statsText.textContent += `\n\n[xmp-live] fuji=${state.xmpFujiPreset || "none"}, strength=${Math.round(state.xmpFujiStrength * 100)}%`;
  } catch (error) {
    setStatus(`应用预设失败: ${error.message}`, true);
  } finally {
    applyPresetBtn.disabled = false;
  }
}

function applyXmpSettingsToImageData(imageData, settings) {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);

  const exposure = clampNum(toNum(settings.exposure, 0), -5, 5);
  const exposureGain = 2 ** exposure;
  const contrast = clampNum(toNum(settings.contrast, 0) / 100, -1.2, 1.2);
  const highlights = clampNum(toNum(settings.highlights, 0) / 100, -1, 1);
  const shadows = clampNum(toNum(settings.shadows, 0) / 100, -1, 1);
  const whites = clampNum(toNum(settings.whites, 0) / 100, -1, 1);
  const blacks = clampNum(toNum(settings.blacks, 0) / 100, -1, 1);
  const saturation = clampNum(toNum(settings.saturation, 0) / 100, -1, 2);
  const vibrance = clampNum(toNum(settings.vibrance, 0) / 100, -1, 1);
  const clarity = clampNum(toNum(settings.clarity, 0) / 100, -1, 1);
  const dehaze = clampNum(toNum(settings.dehaze, 0) / 100, -1, 1);
  const texture = clampNum(toNum(settings.texture, 0) / 100, -1, 1);
  const grain = clampNum(toNum(settings.grain, 0) / 100, 0, 1);
  const vignette = clampNum(toNum(settings.vignette, 0) / 100, -1, 1);
  const temperature = clampNum((toNum(settings.temperature, 5500) - 5500) / 4500, -1.5, 1.5);
  const tint = clampNum(toNum(settings.tint, 0) / 150, -1, 1);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      let r = src[p] / 255;
      let g = src[p + 1] / 255;
      let b = src[p + 2] / 255;

      r *= exposureGain;
      g *= exposureGain;
      b *= exposureGain;

      r += temperature * 0.08 + tint * 0.03;
      g -= tint * 0.06;
      b -= temperature * 0.08 + tint * 0.03;

      const baseContrast = 1 + contrast * 0.9;
      r = (r - 0.5) * baseContrast + 0.5;
      g = (g - 0.5) * baseContrast + 0.5;
      b = (b - 0.5) * baseContrast + 0.5;

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const hiMask = smoothstep(0.55, 1, luma);
      const shMask = 1 - smoothstep(0.2, 0.65, luma);
      const toneDelta =
        -highlights * hiMask * 0.18 +
        shadows * shMask * 0.2 +
        whites * hiMask * 0.12 -
        blacks * shMask * 0.12;
      r += toneDelta;
      g += toneDelta;
      b += toneDelta;

      let hsl = rgbToHsl01(clamp01(r), clamp01(g), clamp01(b));
      hsl.s = clamp01(hsl.s * (1 + saturation));
      hsl.s = clamp01(hsl.s + (1 - hsl.s) * vibrance * 0.65);
      hsl = applyHslAdjustments(hsl, settings);

      let rgb = hslToRgb01(hsl.h, clamp01(hsl.s), clamp01(hsl.l));
      const microContrast = 1 + clarity * 0.25 + texture * 0.15 + dehaze * 0.2;
      rgb.r = (rgb.r - 0.5) * microContrast + 0.5;
      rgb.g = (rgb.g - 0.5) * microContrast + 0.5;
      rgb.b = (rgb.b - 0.5) * microContrast + 0.5;

      if (grain > 0) {
        const noise = (Math.random() - 0.5) * grain * 0.08;
        rgb.r += noise;
        rgb.g += noise;
        rgb.b += noise;
      }

      if (vignette !== 0) {
        const dist = Math.hypot(x - cx, y - cy) / maxDist;
        const vigMask = dist ** 1.8;
        const vigFactor = 1 + vignette * vigMask * 0.6;
        rgb.r *= vigFactor;
        rgb.g *= vigFactor;
        rgb.b *= vigFactor;
      }

      out[p] = Math.round(clamp01(rgb.r) * 255);
      out[p + 1] = Math.round(clamp01(rgb.g) * 255);
      out[p + 2] = Math.round(clamp01(rgb.b) * 255);
      out[p + 3] = src[p + 3];
    }
  }

  return new ImageData(out, width, height);
}

function applyHslAdjustments(hsl, settings) {
  let h = hsl.h;
  let s = hsl.s;
  let l = hsl.l;
  const channels = [
    { name: "Red", center: 0 },
    { name: "Orange", center: 30 },
    { name: "Yellow", center: 60 },
    { name: "Green", center: 120 },
    { name: "Aqua", center: 180 },
    { name: "Blue", center: 240 },
    { name: "Purple", center: 280 },
    { name: "Magenta", center: 320 },
  ];

  for (const channel of channels) {
    const dist = hueDistanceDeg(h, channel.center);
    if (dist > 70) continue;
    const weight = ((70 - dist) / 70) ** 2;
    const hueAdj = toNum(settings[`hue${channel.name}`], 0);
    const satAdj = toNum(settings[`saturation${channel.name}`], 0);
    const lumAdj = toNum(settings[`luminance${channel.name}`], 0);
    h = wrapHueDeg(h + hueAdj * weight);
    s = clamp01(s * (1 + (satAdj / 100) * weight));
    l = clamp01(l + (lumAdj / 100) * weight * 0.38);
  }

  return { h: wrapHueDeg(h), s: clamp01(s), l: clamp01(l) };
}

function rgbToHsl01(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = 60 * (((g - b) / d + 6) % 6);
        break;
      case g:
        h = 60 * ((b - r) / d + 2);
        break;
      default:
        h = 60 * ((r - g) / d + 4);
        break;
    }
  }
  return { h, s: clamp01(s), l: clamp01(l) };
}

function hslToRgb01(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (wrapHueDeg(h) / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = l - c / 2;
  return { r: r + m, g: g + m, b: b + m };
}

function smoothstep(edge0, edge1, x) {
  const t = clampNum((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function hueDistanceDeg(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function wrapHueDeg(h) {
  const out = h % 360;
  return out < 0 ? out + 360 : out;
}

function clamp01(v) {
  return clampNum(v, 0, 1);
}

function toNum(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function createNeutralXmpSettings() {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 5500,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    clarity: 0,
    dehaze: 0,
    texture: 0,
    vignette: 0,
    grain: 0,
    hueRed: 0,
    hueOrange: 0,
    hueYellow: 0,
    hueGreen: 0,
    hueAqua: 0,
    hueBlue: 0,
    huePurple: 0,
    hueMagenta: 0,
    saturationRed: 0,
    saturationOrange: 0,
    saturationYellow: 0,
    saturationGreen: 0,
    saturationAqua: 0,
    saturationBlue: 0,
    saturationPurple: 0,
    saturationMagenta: 0,
    luminanceRed: 0,
    luminanceOrange: 0,
    luminanceYellow: 0,
    luminanceGreen: 0,
    luminanceAqua: 0,
    luminanceBlue: 0,
    luminancePurple: 0,
    luminanceMagenta: 0,
  };
}

function syncXmpFujiControls() {
  if (!xmpFujiPreset || !xmpFujiStrengthRange || !xmpFujiStrengthValue) return;
  xmpFujiPreset.value = state.xmpFujiPreset || "none";
  const strengthPct = Math.round(clampNum(state.xmpFujiStrength, 0, 1) * 100);
  xmpFujiStrengthRange.value = String(strengthPct);
  xmpFujiStrengthValue.textContent = `${strengthPct}%`;
}

function syncXmpControls() {
  if (!state.xmpManualSettings) return;
  syncXmpFujiControls();
  syncXmpBasicControls();
  syncXmpHslControls();
}

function syncXmpBasicControls() {
  if (!state.xmpManualSettings) return;
  if (!xmpExposureRange || !xmpTemperatureRange || !xmpTintRange) return;
  if (!xmpExposureValue || !xmpTemperatureValue || !xmpTintValue) return;
  xmpExposureRange.value = Number(state.xmpManualSettings.exposure || 0).toFixed(2);
  xmpTemperatureRange.value = String(Math.round(state.xmpManualSettings.temperature || 5500));
  xmpTintRange.value = String(Math.round(state.xmpManualSettings.tint || 0));

  xmpExposureValue.textContent = Number(state.xmpManualSettings.exposure || 0).toFixed(2);
  xmpTemperatureValue.textContent = String(Math.round(state.xmpManualSettings.temperature || 5500));
  xmpTintValue.textContent = String(Math.round(state.xmpManualSettings.tint || 0));
}

function syncXmpHslControls() {
  if (!state.xmpManualSettings) return;
  if (!xmpHslChannel || !xmpHslHueRange || !xmpHslSaturationRange || !xmpHslLuminanceRange) return;
  if (!xmpHslHueValue || !xmpHslSaturationValue || !xmpHslLuminanceValue) return;
  const channel = XMP_HSL_CHANNELS.includes(state.xmpHslChannel) ? state.xmpHslChannel : "orange";
  state.xmpHslChannel = channel;
  xmpHslChannel.value = channel;

  const keys = getXmpHslKeys(channel);
  const hue = Math.round(state.xmpManualSettings[keys.hue] || 0);
  const sat = Math.round(state.xmpManualSettings[keys.saturation] || 0);
  const lum = Math.round(state.xmpManualSettings[keys.luminance] || 0);

  xmpHslHueRange.value = String(hue);
  xmpHslSaturationRange.value = String(sat);
  xmpHslLuminanceRange.value = String(lum);
  xmpHslHueValue.textContent = String(hue);
  xmpHslSaturationValue.textContent = String(sat);
  xmpHslLuminanceValue.textContent = String(lum);
}

function getXmpHslKeys(channel) {
  const safe = XMP_HSL_CHANNELS.includes(channel) ? channel : "orange";
  const cap = safe.slice(0, 1).toUpperCase() + safe.slice(1);
  return {
    hue: `hue${cap}`,
    saturation: `saturation${cap}`,
    luminance: `luminance${cap}`,
    label: cap,
  };
}

function setXmpControlsEnabled(enabled) {
  const active = Boolean(enabled && state.xmpGenerator);
  const controls = [
    xmpResetBtn,
    applyPresetBtn,
    xmpFujiPreset,
    xmpFujiStrengthRange,
    xmpExposureRange,
    xmpTemperatureRange,
    xmpTintRange,
    xmpHslChannel,
    xmpHslHueRange,
    xmpHslSaturationRange,
    xmpHslLuminanceRange,
  ];

  for (const control of controls) {
    if (!control) continue;
    control.disabled = !active;
  }

  if (!xmpPreviewHint) return;
  if (!state.xmpGenerator) {
    xmpPreviewHint.textContent = "XMP generator missing. Refresh the page to load preset export tools.";
    return;
  }
  if (!active) {
    xmpPreviewHint.textContent = "Upload target image first. You can then apply Fuji-style preset directly.";
    return;
  }
  xmpPreviewHint.textContent = state.latestTransfer
    ? "Auto-generated from current transfer. You can apply preset to image or export .xmp."
    : "Target loaded. Pick a Fuji preset, tweak values, and click apply to preview result.";
}

function renderXmpPreview() {
  if (!xmpPreviewText) return;
  const settings = state.xmpManualSettings;
  if (!settings) {
    xmpPreviewText.textContent = "No XMP parameters yet.";
    return;
  }

  const keys = getXmpHslKeys(state.xmpHslChannel);
  const presetKey = state.latestTransfer?.options?.presetKey || "none";
  const fujiPreset = state.xmpFujiPreset || "none";
  const fujiStrength = Math.round(clampNum(state.xmpFujiStrength, 0, 1) * 100);
  xmpPreviewText.textContent = [
    `Exposure2012=${Number(settings.exposure).toFixed(2)}`,
    `Temperature=${Math.round(settings.temperature)} | Tint=${Math.round(settings.tint)}`,
    `Vibrance=${Math.round(settings.vibrance)} | Saturation=${Math.round(settings.saturation)}`,
    `Highlights=${Math.round(settings.highlights)} | Shadows=${Math.round(settings.shadows)}`,
    `Whites=${Math.round(settings.whites)} | Blacks=${Math.round(settings.blacks)}`,
    `HSL(${keys.label}): Hue=${Math.round(settings[keys.hue])}, Sat=${Math.round(settings[keys.saturation])}, Lum=${Math.round(settings[keys.luminance])}`,
    `fuji=${fujiPreset} (${fujiStrength}%)`,
    `preset=${presetKey}`,
  ].join("\n");
}

function clampNum(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

function setThumbPreview(type, file) {
  const url = URL.createObjectURL(file);
  if (type === "source") {
    if (state.sourceThumbUrl) URL.revokeObjectURL(state.sourceThumbUrl);
    state.sourceThumbUrl = url;
    sourceThumb.src = url;
    return;
  }
  if (state.targetThumbUrl) URL.revokeObjectURL(state.targetThumbUrl);
  state.targetThumbUrl = url;
  targetThumb.src = url;
}

async function recommendConfig(sourceImage, targetImage) {
  const src = sampleVisualStats(sourceImage);
  const tgt = sampleVisualStats(targetImage);

  const recommendation = {
    algorithm: "reinhard",
    preset: "none",
    quality: detectDefaultQuality(),
    strength: 90,
    saturation: 100,
    lumaPreserve: 40,
    reason: "基于图像颜色分布推荐了平衡配置",
  };

  if (tgt.whiteRatio > 0.38) {
    recommendation.preset = "ecom";
    recommendation.algorithm = "reinhard";
    recommendation.saturation = 92;
    recommendation.lumaPreserve = 58;
    recommendation.reason = "目标图高比例浅背景，切换电商清透风格";
  } else if (src.saturation - tgt.saturation > 0.12) {
    recommendation.preset = "social";
    recommendation.algorithm = "enhanced";
    recommendation.saturation = 118;
    recommendation.strength = 94;
    recommendation.reason = "参考图色彩更浓郁，切换社媒高对比增强";
  } else if (src.warmth > tgt.warmth + 8) {
    recommendation.preset = "film";
    recommendation.algorithm = "enhanced";
    recommendation.saturation = 104;
    recommendation.lumaPreserve = 46;
    recommendation.reason = "参考图更暖，切换胶片柔和防止过硬色偏";
  } else {
    recommendation.preset = "cinematic";
    recommendation.algorithm = "enhanced";
    recommendation.strength = 88;
    recommendation.saturation = 108;
    recommendation.lumaPreserve = 34;
    recommendation.reason = "场景动态范围较高，切换电影青橙强化氛围";
  }

  if (recommendation.quality === "mobile") {
    recommendation.reason += "，并启用手机优先性能档位";
  }

  return recommendation;
}

function sampleVisualStats(image) {
  const sample = createScaledImageData(image, 120000);
  const data = sample.data;
  const n = data.length / 4;
  let sumSat = 0;
  let sumWarmth = 0;
  let whitePixels = 0;

  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma > 0.86 && sat < 0.12) whitePixels += 1;

    sumSat += sat;
    sumWarmth += (r - b) * 100;
  }

  return {
    saturation: sumSat / n,
    warmth: sumWarmth / n,
    whiteRatio: whitePixels / n,
  };
}

function applyRecommendation(rec) {
  algorithmSelect.value = rec.algorithm;
  presetSelect.value = rec.preset;
  qualitySelect.value = rec.quality;
  strengthRange.value = String(rec.strength);
  saturationRange.value = String(rec.saturation);
  lumaPreserveRange.value = String(rec.lumaPreserve);
  syncUiOutputs();
}

function renderStats(result, options, mode) {
  const stats = result.stats;
  return [
    `[${mode}] ${result.width}x${result.height} | ${result.durationMs.toFixed(0)}ms`,
    `algorithm=${options.mode}, preset=${options.preset.name}`,
    `strength=${options.strength.toFixed(2)}, saturation=${options.saturation.toFixed(2)}, lumaPreserve=${options.lumaPreserve.toFixed(2)}`,
    `source mean=${fmtArr(stats.source.mean)} std=${fmtArr(stats.source.std)}`,
    `target mean=${fmtArr(stats.target.mean)} std=${fmtArr(stats.target.std)}`,
    `source ab mean=${fmtArr(stats.sourceAB.mean)} cov=${fmtArr(stats.sourceAB.cov)}`,
    `target ab mean=${fmtArr(stats.targetAB.mean)} cov=${fmtArr(stats.targetAB.cov)}`,
  ].join("\n");
}

function syncUiOutputs() {
  strengthValue.textContent = `${strengthRange.value}%`;
  saturationValue.textContent = `${(Number(saturationRange.value) / 100).toFixed(2)}x`;
  lumaPreserveValue.textContent = `${lumaPreserveRange.value}%`;
}

function fmtArr(arr) {
  return `[${arr.map((v) => Number(v).toFixed(2)).join(", ")}]`;
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "var(--danger)" : "var(--accent)";
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function detectDefaultQuality() {
  const isMobile = window.matchMedia("(max-width: 800px)").matches;
  const lowMem = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  return isMobile || lowMem ? "mobile" : "balanced";
}

qualitySelect.value = detectDefaultQuality();
syncUiOutputs();
setXmpControlsEnabled(false);
renderXmpPreview();
afterLayer.style.width = `${compareSlider.value}%`;

