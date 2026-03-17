const sourceInput = document.getElementById("sourceInput");
const targetInput = document.getElementById("targetInput");
const sourceThumb = document.getElementById("sourceThumb");
const targetThumb = document.getElementById("targetThumb");
const processBtn = document.getElementById("processBtn");
const downloadBtn = document.getElementById("downloadBtn");
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

const state = {
  sourceImg: null,
  targetImg: null,
  sourceThumbUrl: null,
  targetThumbUrl: null,
  outputBlobUrl: null,
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
  setThumbPreview("source", file);
  setStatus("参考图已加载");
});

targetInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  state.targetImg = await fileToImage(file);
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

    await setDownloadFromImageData(previewResult.outputImageData);
    downloadBtn.disabled = false;
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
afterLayer.style.width = `${compareSlider.value}%`;
