const SRGB_TO_LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  SRGB_TO_LINEAR_LUT[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

self.onmessage = (event) => {
  const message = event.data ?? {};
  if (message.type !== "transfer") return;

  const id = message.id;
  try {
    const payload = message.payload;
    const result = runTransfer(payload, (progress) => {
      self.postMessage({ id, type: "progress", progress });
    });
    self.postMessage(
      {
        id,
        type: "done",
        payload: {
          width: payload.target.width,
          height: payload.target.height,
          buffer: result.buffer,
          stats: result.stats,
        },
      },
      [result.buffer]
    );
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error instanceof Error ? error.message : "Worker 处理失败",
    });
  }
};

function runTransfer(payload, onProgress) {
  const sourceRgba = new Uint8ClampedArray(payload.source.buffer);
  const targetRgba = new Uint8ClampedArray(payload.target.buffer);
  const options = payload.options;

  const sourceLab = rgbaToLabArray(sourceRgba, false);
  const targetLab = rgbaToLabArray(targetRgba, options.invert);

  const sourceStats = robustLabMeanStd(sourceLab, options.robustTrim);
  const targetStats = robustLabMeanStd(targetLab, options.robustTrim);
  const sourceAB = abCovariance(sourceLab);
  const targetAB = abCovariance(targetLab);
  const enhanceMat = computeAbTransform(sourceAB, targetAB);

  const out = new Uint8ClampedArray(targetRgba.length);
  const n = targetLab.length / 3;
  const chunk = Math.max(1, Math.floor(n / 10));
  const epsilon = 1e-6;
  const preset = options.preset;

  for (let i = 0; i < n; i += 1) {
    if (i % chunk === 0) {
      onProgress(i / n);
    }
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
    if (options.mode === "enhanced") {
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

    const lBlended = lMapped * (1 - options.lumaPreserve) + l * options.lumaPreserve;
    const lStyled = (lBlended - 50) * preset.contrast + 50 + preset.lBias;
    const aStyled = aMapped * options.saturation * preset.aScale + preset.aBias;
    const bStyled = bMapped * options.saturation * preset.bScale + preset.bBias;

    const rgb = labToRgb(clamp(lStyled, 0, 100), clamp(aStyled, -128, 127), clamp(bStyled, -128, 127));
    const blend = options.strength;

    out[p] = clamp(targetRgba[p] * (1 - blend) + rgb[0] * blend, 0, 255);
    out[p + 1] = clamp(targetRgba[p + 1] * (1 - blend) + rgb[1] * blend, 0, 255);
    out[p + 2] = clamp(targetRgba[p + 2] * (1 - blend) + rgb[2] * blend, 0, 255);
    out[p + 3] = targetRgba[p + 3];
  }

  onProgress(1);

  return {
    buffer: out.buffer,
    stats: {
      source: sourceStats,
      target: targetStats,
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

function robustLabMeanStd(labArray, trimRatio) {
  const n = labArray.length / 3;
  const bounds = [
    percentileBounds(labArray, 0, 0, 100, 512, trimRatio),
    percentileBounds(labArray, 1, -128, 127, 512, trimRatio),
    percentileBounds(labArray, 2, -128, 127, 512, trimRatio),
  ];

  const mean = [0, 0, 0];
  const variance = [0, 0, 0];

  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    for (let c = 0; c < 3; c += 1) {
      const clipped = clamp(labArray[j + c], bounds[c][0], bounds[c][1]);
      mean[c] += clipped;
    }
  }

  mean[0] /= n;
  mean[1] /= n;
  mean[2] /= n;

  for (let i = 0; i < n; i += 1) {
    const j = i * 3;
    for (let c = 0; c < 3; c += 1) {
      const clipped = clamp(labArray[j + c], bounds[c][0], bounds[c][1]);
      variance[c] += (clipped - mean[c]) ** 2;
    }
  }

  return {
    mean,
    std: [
      Math.sqrt(variance[0] / Math.max(1, n - 1)),
      Math.sqrt(variance[1] / Math.max(1, n - 1)),
      Math.sqrt(variance[2] / Math.max(1, n - 1)),
    ],
  };
}

function percentileBounds(labArray, channelOffset, minV, maxV, bins, trimRatio) {
  const n = labArray.length / 3;
  const hist = new Uint32Array(bins);
  const range = maxV - minV;
  const scale = (bins - 1) / range;

  for (let i = 0; i < n; i += 1) {
    const idx = i * 3 + channelOffset;
    const value = clamp(labArray[idx], minV, maxV);
    const bin = Math.round((value - minV) * scale);
    hist[bin] += 1;
  }

  const lowTarget = Math.floor(n * trimRatio);
  const highTarget = Math.floor(n * (1 - trimRatio));
  let cumulative = 0;
  let lowBin = 0;
  let highBin = bins - 1;

  for (let i = 0; i < bins; i += 1) {
    cumulative += hist[i];
    if (cumulative >= lowTarget) {
      lowBin = i;
      break;
    }
  }

  cumulative = 0;
  for (let i = 0; i < bins; i += 1) {
    cumulative += hist[i];
    if (cumulative >= highTarget) {
      highBin = i;
      break;
    }
  }

  return [minV + (lowBin / (bins - 1)) * range, minV + (highBin / (bins - 1)) * range];
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
  const rs = SRGB_TO_LINEAR_LUT[r];
  const gs = SRGB_TO_LINEAR_LUT[g];
  const bs = SRGB_TO_LINEAR_LUT[b];

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

  return [
    Math.round(clamp(rl, 0, 1) * 255),
    Math.round(clamp(gl, 0, 1) * 255),
    Math.round(clamp(bl, 0, 1) * 255),
  ];
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
