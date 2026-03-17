const sourceInput = document.getElementById("sourceInput");
const targetInput = document.getElementById("targetInput");
const sourceThumb = document.getElementById("sourceThumb");
const targetThumb = document.getElementById("targetThumb");
const processBtn = document.getElementById("processBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("statusText");
const statsText = document.getElementById("statsText");
const algorithmSelect = document.getElementById("algorithmSelect");
const strengthRange = document.getElementById("strengthRange");
const strengthValue = document.getElementById("strengthValue");
const saturationRange = document.getElementById("saturationRange");
const saturationValue = document.getElementById("saturationValue");
const invertToggle = document.getElementById("invertToggle");
const compareSlider = document.getElementById("compareSlider");
const afterLayer = document.getElementById("afterLayer");
const beforeCanvas = document.getElementById("beforeCanvas");
const afterCanvas = document.getElementById("afterCanvas");
const beforeCtx = beforeCanvas.getContext("2d", { willReadFrequently: true });
const afterCtx = afterCanvas.getContext("2d", { willReadFrequently: true });

const state = {
  sourceImg: null,
  targetImg: null,
  outputBlobUrl: null,
  sourceThumbUrl: null,
  targetThumbUrl: null,
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
  drawToCanvas(state.targetImg, beforeCanvas, beforeCtx);
  drawToCanvas(state.targetImg, afterCanvas, afterCtx);
  setStatus("目标图已加载，可开始迁移");
});

strengthRange.addEventListener("input", () => {
  strengthValue.textContent = `${strengthRange.value}%`;
});

saturationRange.addEventListener("input", () => {
  const value = Number(saturationRange.value) / 100;
  saturationValue.textContent = `${value.toFixed(2)}x`;
});

compareSlider.addEventListener("input", () => {
  afterLayer.style.width = `${compareSlider.value}%`;
});

window.addEventListener("beforeunload", () => {
  if (state.outputBlobUrl) URL.revokeObjectURL(state.outputBlobUrl);
  if (state.sourceThumbUrl) URL.revokeObjectURL(state.sourceThumbUrl);
  if (state.targetThumbUrl) URL.revokeObjectURL(state.targetThumbUrl);
});

downloadBtn.addEventListener("click", () => {
  if (!state.outputBlobUrl) return;
  const link = document.createElement("a");
  link.href = state.outputBlobUrl;
  link.download = "toneport-result.png";
  link.click();
});

processBtn.addEventListener("click", async () => {
  if (!state.sourceImg || !state.targetImg) {
    setStatus("请先上传参考图和目标图", true);
    return;
  }

  setStatus("正在分析颜色统计并迁移，请稍候...");
  processBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    const opts = {
      mode: algorithmSelect.value,
      strength: Number(strengthRange.value) / 100,
      saturation: Number(saturationRange.value) / 100,
      invert: invertToggle.checked,
    };
    const result = await colorTransfer(state.sourceImg, state.targetImg, opts);
    drawImageData(result.imageData, afterCanvas, afterCtx);
    drawToCanvas(state.targetImg, beforeCanvas, beforeCtx);
    afterLayer.style.width = `${compareSlider.value}%`;

    if (state.outputBlobUrl) {
      URL.revokeObjectURL(state.outputBlobUrl);
    }
    state.outputBlobUrl = await canvasToObjectUrl(afterCanvas);
    downloadBtn.disabled = false;
    setStatus("迁移完成，可预览和下载");
    statsText.textContent = renderStats(result.stats, opts);
  } catch (error) {
    setStatus(`处理失败: ${error.message}`, true);
  } finally {
    processBtn.disabled = false;
  }
});

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "var(--danger)" : "var(--accent)";
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

function drawToCanvas(image, canvas, ctx) {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function drawImageData(imageData, canvas, ctx) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
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

function setThumbPreview(type, file) {
  const nextUrl = URL.createObjectURL(file);
  if (type === "source") {
    if (state.sourceThumbUrl) URL.revokeObjectURL(state.sourceThumbUrl);
    state.sourceThumbUrl = nextUrl;
    sourceThumb.src = nextUrl;
    return;
  }
  if (state.targetThumbUrl) URL.revokeObjectURL(state.targetThumbUrl);
  state.targetThumbUrl = nextUrl;
  targetThumb.src = nextUrl;
}

async function colorTransfer(sourceImg, targetImg, opts) {
  await nextFrame();

  const srcCanvas = document.createElement("canvas");
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  srcCanvas.width = sourceImg.naturalWidth;
  srcCanvas.height = sourceImg.naturalHeight;
  srcCtx.drawImage(sourceImg, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const tgtCanvas = document.createElement("canvas");
  const tgtCtx = tgtCanvas.getContext("2d", { willReadFrequently: true });
  tgtCanvas.width = targetImg.naturalWidth;
  tgtCanvas.height = targetImg.naturalHeight;
  tgtCtx.drawImage(targetImg, 0, 0);
  const tgtData = tgtCtx.getImageData(0, 0, tgtCanvas.width, tgtCanvas.height);

  const sourceLab = rgbaToLabArray(srcData.data, false);
  const targetLab = rgbaToLabArray(tgtData.data, opts.invert);
  const sourceStats = labMeanStd(sourceLab);
  const targetStats = labMeanStd(targetLab);
  const sourceAB = abCovariance(sourceLab);
  const targetAB = abCovariance(targetLab);
  const enhanceMat = computeAbTransform(sourceAB, targetAB);

  const outData = new Uint8ClampedArray(tgtData.data.length);
  const n = targetLab.length / 3;
  const epsilon = 1e-6;

  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    const p = i * 4;
    const l = targetLab[j];
    const a = targetLab[j + 1];
    const b = targetLab[j + 2];

    const lMapped =
      ((l - targetStats.mean[0]) * sourceStats.std[0]) / (targetStats.std[0] + epsilon) +
      sourceStats.mean[0];

    let aMapped;
    let bMapped;
    if (opts.mode === "enhanced") {
      const da = a - targetAB.mean[0];
      const db = b - targetAB.mean[1];
      aMapped = enhanceMat[0] * da + enhanceMat[1] * db + sourceAB.mean[0];
      bMapped = enhanceMat[2] * da + enhanceMat[3] * db + sourceAB.mean[1];
    } else {
      aMapped =
        ((a - targetStats.mean[1]) * sourceStats.std[1]) / (targetStats.std[1] + epsilon) +
        sourceStats.mean[1];
      bMapped =
        ((b - targetStats.mean[2]) * sourceStats.std[2]) / (targetStats.std[2] + epsilon) +
        sourceStats.mean[2];
    }

    aMapped *= opts.saturation;
    bMapped *= opts.saturation;

    const mappedRgb = labToRgb(clamp(lMapped, 0, 100), clamp(aMapped, -128, 127), clamp(bMapped, -128, 127));
    const blend = opts.strength;
    const srcR = tgtData.data[p];
    const srcG = tgtData.data[p + 1];
    const srcB = tgtData.data[p + 2];

    outData[p] = clamp(srcR * (1 - blend) + mappedRgb[0] * blend, 0, 255);
    outData[p + 1] = clamp(srcG * (1 - blend) + mappedRgb[1] * blend, 0, 255);
    outData[p + 2] = clamp(srcB * (1 - blend) + mappedRgb[2] * blend, 0, 255);
    outData[p + 3] = tgtData.data[p + 3];
  }

  return {
    imageData: new ImageData(outData, tgtData.width, tgtData.height),
    stats: {
      sourceStats,
      targetStats,
      sourceAB,
      targetAB,
    },
  };
}

function rgbaToLabArray(rgba, invert) {
  const n = rgba.length / 4;
  const out = new Float32Array(n * 3);

  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const j = i * 3;
    let r = rgba[p];
    let g = rgba[p + 1];
    let b = rgba[p + 2];

    if (invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    const lab = rgbToLab(r, g, b);
    out[j] = lab[0];
    out[j + 1] = lab[1];
    out[j + 2] = lab[2];
  }
  return out;
}

function labMeanStd(labArray) {
  const n = labArray.length / 3;
  const mean = [0, 0, 0];
  const variance = [0, 0, 0];
  const std = [0, 0, 0];

  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    mean[0] += labArray[j];
    mean[1] += labArray[j + 1];
    mean[2] += labArray[j + 2];
  }

  mean[0] /= n;
  mean[1] /= n;
  mean[2] /= n;

  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    variance[0] += (labArray[j] - mean[0]) ** 2;
    variance[1] += (labArray[j + 1] - mean[1]) ** 2;
    variance[2] += (labArray[j + 2] - mean[2]) ** 2;
  }

  std[0] = Math.sqrt(variance[0] / Math.max(1, n - 1));
  std[1] = Math.sqrt(variance[1] / Math.max(1, n - 1));
  std[2] = Math.sqrt(variance[2] / Math.max(1, n - 1));

  return { mean, std };
}

function abCovariance(labArray) {
  const n = labArray.length / 3;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    meanA += labArray[j + 1];
    meanB += labArray[j + 2];
  }
  meanA /= n;
  meanB /= n;

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    const da = labArray[j + 1] - meanA;
    const db = labArray[j + 2] - meanB;
    c00 += da * da;
    c01 += da * db;
    c11 += db * db;
  }
  const denom = Math.max(1, n - 1);
  return {
    mean: [meanA, meanB],
    cov: [c00 / denom, c01 / denom, c01 / denom, c11 / denom],
  };
}

function computeAbTransform(sourceAB, targetAB) {
  const eps = 1e-4;
  const srcCov = regularizeCov(sourceAB.cov, eps);
  const tgtCov = regularizeCov(targetAB.cov, eps);
  const sqrtSrc = matrixPowerSym2(srcCov, 0.5);
  const invSqrtTgt = matrixPowerSym2(tgtCov, -0.5);
  return mul2x2(sqrtSrc, invSqrtTgt);
}

function regularizeCov(m, eps) {
  return [m[0] + eps, m[1], m[2], m[3] + eps];
}

function matrixPowerSym2(m, power) {
  const a = m[0];
  const b = m[1];
  const d = m[3];
  const tr = a + d;
  const detTerm = Math.sqrt((a - d) * (a - d) + 4 * b * b);
  let l1 = (tr + detTerm) / 2;
  let l2 = (tr - detTerm) / 2;
  l1 = Math.max(l1, 1e-8);
  l2 = Math.max(l2, 1e-8);

  let v1x;
  let v1y;
  if (Math.abs(b) > 1e-8) {
    v1x = l1 - d;
    v1y = b;
  } else {
    v1x = 1;
    v1y = 0;
  }

  const norm = Math.hypot(v1x, v1y) || 1;
  v1x /= norm;
  v1y /= norm;
  const v2x = -v1y;
  const v2y = v1x;

  const p1 = Math.pow(l1, power);
  const p2 = Math.pow(l2, power);

  return [
    p1 * v1x * v1x + p2 * v2x * v2x,
    p1 * v1x * v1y + p2 * v2x * v2y,
    p1 * v1y * v1x + p2 * v2y * v2x,
    p1 * v1y * v1y + p2 * v2y * v2y,
  ];
}

function mul2x2(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

function rgbToLab(r, g, b) {
  const rs = srgbToLinear(r / 255);
  const gs = srgbToLinear(g / 255);
  const bs = srgbToLinear(b / 255);

  const x = rs * 0.4124564 + gs * 0.3575761 + bs * 0.1804375;
  const y = rs * 0.2126729 + gs * 0.7151522 + bs * 0.072175;
  const z = rs * 0.0193339 + gs * 0.119192 + bs * 0.9503041;

  const xr = x / 0.95047;
  const yr = y;
  const zr = z / 1.08883;

  const fx = fLab(xr);
  const fy = fLab(yr);
  const fz = fLab(zr);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(l, a, b) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const xr = invFLab(fx);
  const yr = invFLab(fy);
  const zr = invFLab(fz);

  const x = xr * 0.95047;
  const y = yr;
  const z = zr * 1.08883;

  let rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  rl = linearToSrgb(rl);
  gl = linearToSrgb(gl);
  bl = linearToSrgb(bl);

  return [Math.round(clamp(rl, 0, 1) * 255), Math.round(clamp(gl, 0, 1) * 255), Math.round(clamp(bl, 0, 1) * 255)];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function fLab(t) {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

function invFLab(t) {
  const delta = 6 / 29;
  return t > delta ? t ** 3 : 3 * delta * delta * (t - 4 / 29);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function renderStats(stats, opts) {
  return [
    `mode=${opts.mode} | strength=${opts.strength.toFixed(2)} | saturation=${opts.saturation.toFixed(2)} | invert=${opts.invert}`,
    "",
    `source LAB mean: ${fmtArr(stats.sourceStats.mean)}`,
    `source LAB std : ${fmtArr(stats.sourceStats.std)}`,
    `target LAB mean: ${fmtArr(stats.targetStats.mean)}`,
    `target LAB std : ${fmtArr(stats.targetStats.std)}`,
    "",
    `source a/b mean: ${fmtArr(stats.sourceAB.mean)} cov=${fmtArr(stats.sourceAB.cov)}`,
    `target a/b mean: ${fmtArr(stats.targetAB.mean)} cov=${fmtArr(stats.targetAB.cov)}`,
  ].join("\n");
}

function fmtArr(arr) {
  return `[${arr.map((v) => Number(v).toFixed(3)).join(", ")}]`;
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

strengthValue.textContent = `${strengthRange.value}%`;
saturationValue.textContent = `${(Number(saturationRange.value) / 100).toFixed(2)}x`;
afterLayer.style.width = `${compareSlider.value}%`;
