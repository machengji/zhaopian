class XMPGenerator {
  constructor(baseTemperature = 5500) {
    this.baseTemperature = baseTemperature;
  }

  generateFromTransfer(input) {
    const settings = this.calculateFromTransfer(input);
    const presetName = input?.presetName || "TonePort Preset";
    return {
      settings,
      xmpContent: this.generateXMP(settings, presetName),
    };
  }

  applyFujiPreset(baseSettings, fujiPresetKey, amount = 1) {
    const working = normalizeSettings({ ...(baseSettings || {}) });
    const key = String(fujiPresetKey || "none");
    const profile = FUJI_XMP_PRESETS[key];
    const intensity = clamp(toNumber(amount, 1), 0, 1);
    if (!profile || intensity <= 0) {
      return working;
    }

    if (profile.mode === "absolute") {
      for (const [settingKey, targetValueRaw] of Object.entries(profile.settings || {})) {
        const current = toNumber(working[settingKey], 0);
        const targetValue = toNumber(targetValueRaw, current);
        working[settingKey] = current + (targetValue - current) * intensity;
      }
      return normalizeSettings(working);
    }

    for (const [settingKey, delta] of Object.entries(profile.adjustments || {})) {
      const current = toNumber(working[settingKey], 0);
      working[settingKey] = current + toNumber(delta, 0) * intensity;
    }
    return normalizeSettings(working);
  }

  calculateFromTransfer(input) {
    const sourceStats = input?.sourceStats;
    const targetStats = input?.targetStats;
    if (!sourceStats || !targetStats) {
      throw new Error("Missing source or target stats for XMP generation");
    }

    const options = input?.options ?? {};
    const strength = clamp(toNumber(options.strength, 1), 0, 1);
    const saturationScale = toNumber(options.saturation, 1);
    const lumaPreserve = clamp(toNumber(options.lumaPreserve, 0), 0, 1);
    const presetKey = String(options.presetKey || "none");

    const meanLDelta = sourceStats.mean[0] - targetStats.mean[0];
    const meanADelta = sourceStats.mean[1] - targetStats.mean[1];
    const meanBDelta = sourceStats.mean[2] - targetStats.mean[2];
    const lumaStdDelta = sourceStats.std[0] - targetStats.std[0];
    const chromaStdDelta =
      (sourceStats.std[1] + sourceStats.std[2]) - (targetStats.std[1] + targetStats.std[2]);

    const settings = {
      exposure: clamp((meanLDelta / 16) * strength, -5, 5),
      contrast: clamp(lumaStdDelta * 3.4 * strength, -100, 100),
      highlights: clamp((-meanLDelta * 1.8 - lumaStdDelta * 1.2) * strength, -100, 100),
      shadows: clamp((meanLDelta * 2.2 + lumaStdDelta * 1.4) * strength, -100, 100),
      whites: clamp((meanLDelta * 1.6 + lumaStdDelta * 1.1) * strength, -100, 100),
      blacks: clamp((-meanLDelta * 1.4 - lumaStdDelta * 1.2) * strength, -100, 100),
      temperature: clamp(this.baseTemperature + meanBDelta * 85 * strength, 2000, 50000),
      tint: clamp(meanADelta * 2.2 * strength, -150, 150),
      vibrance: clamp(chromaStdDelta * 2.8 * strength, -100, 100),
      saturation: clamp((saturationScale - 1) * 100 * strength, -100, 100),
      clarity: clamp((lumaStdDelta * 1.8 - lumaPreserve * 28) * strength, -100, 100),
      dehaze: clamp((lumaStdDelta * 1.1 - lumaPreserve * 10) * strength, -100, 100),
      texture: clamp((lumaStdDelta * 0.9 + chromaStdDelta * 0.25) * strength, -100, 100),
      vignette: 0,
      grain: 0,
      hueRed: 0,
      hueOrange: clamp(-meanBDelta * 0.7 * strength, -100, 100),
      hueYellow: clamp(-meanBDelta * 0.4 * strength, -100, 100),
      hueGreen: clamp(-meanADelta * 0.3 * strength, -100, 100),
      hueAqua: 0,
      hueBlue: clamp(meanBDelta * 0.8 * strength, -100, 100),
      huePurple: clamp(meanADelta * 0.3 * strength, -100, 100),
      hueMagenta: 0,
      saturationRed: clamp(meanADelta * 0.8 * strength, -100, 100),
      saturationOrange: clamp((meanBDelta * 1.2 + chromaStdDelta * 0.6) * strength, -100, 100),
      saturationYellow: clamp((meanBDelta * 0.8 + chromaStdDelta * 0.4) * strength, -100, 100),
      saturationGreen: clamp((-meanADelta * 0.5 + chromaStdDelta * 0.2) * strength, -100, 100),
      saturationAqua: clamp((-meanBDelta * 0.3 + chromaStdDelta * 0.3) * strength, -100, 100),
      saturationBlue: clamp((-meanBDelta * 1.1 + chromaStdDelta * 0.6) * strength, -100, 100),
      saturationPurple: clamp((meanADelta * 0.5 + chromaStdDelta * 0.3) * strength, -100, 100),
      saturationMagenta: clamp((meanADelta * 0.6 + chromaStdDelta * 0.3) * strength, -100, 100),
      luminanceRed: clamp(meanLDelta * 0.7 * strength, -100, 100),
      luminanceOrange: clamp(meanLDelta * 0.9 * strength, -100, 100),
      luminanceYellow: clamp(meanLDelta * 0.6 * strength, -100, 100),
      luminanceGreen: clamp(meanLDelta * 0.4 * strength, -100, 100),
      luminanceAqua: clamp(-meanLDelta * 0.3 * strength, -100, 100),
      luminanceBlue: clamp(-meanLDelta * 0.8 * strength, -100, 100),
      luminancePurple: clamp(-meanLDelta * 0.4 * strength, -100, 100),
      luminanceMagenta: clamp(-meanLDelta * 0.3 * strength, -100, 100),
    };

    applyPresetStyle(settings, presetKey, strength);
    return normalizeSettings(settings);
  }

  generateXMP(settings, presetName) {
    const safeName = escapeXmlAttr(presetName || "TonePort Preset");
    const s = settings;
    const attrs = [
      ["crs:Name", safeName],
      ["crs:ProcessVersion", "11.0"],
      ["crs:Version", "11.0"],
      ["crs:HasSettings", "True"],
      ["crs:Exposure2012", s.exposure.toFixed(2)],
      ["crs:Contrast2012", integerString(s.contrast)],
      ["crs:Highlights2012", integerString(s.highlights)],
      ["crs:Shadows2012", integerString(s.shadows)],
      ["crs:Whites2012", integerString(s.whites)],
      ["crs:Blacks2012", integerString(s.blacks)],
      ["crs:Temperature", integerString(s.temperature)],
      ["crs:Tint", integerString(s.tint)],
      ["crs:Vibrance", integerString(s.vibrance)],
      ["crs:Saturation", integerString(s.saturation)],
      ["crs:Clarity2012", integerString(s.clarity)],
      ["crs:Dehaze", integerString(s.dehaze)],
      ["crs:Texture", integerString(s.texture)],
      ["crs:HueRed", integerString(s.hueRed)],
      ["crs:HueOrange", integerString(s.hueOrange)],
      ["crs:HueYellow", integerString(s.hueYellow)],
      ["crs:HueGreen", integerString(s.hueGreen)],
      ["crs:HueAqua", integerString(s.hueAqua)],
      ["crs:HueBlue", integerString(s.hueBlue)],
      ["crs:HuePurple", integerString(s.huePurple)],
      ["crs:HueMagenta", integerString(s.hueMagenta)],
      ["crs:SaturationRed", integerString(s.saturationRed)],
      ["crs:SaturationOrange", integerString(s.saturationOrange)],
      ["crs:SaturationYellow", integerString(s.saturationYellow)],
      ["crs:SaturationGreen", integerString(s.saturationGreen)],
      ["crs:SaturationAqua", integerString(s.saturationAqua)],
      ["crs:SaturationBlue", integerString(s.saturationBlue)],
      ["crs:SaturationPurple", integerString(s.saturationPurple)],
      ["crs:SaturationMagenta", integerString(s.saturationMagenta)],
      ["crs:LuminanceRed", integerString(s.luminanceRed)],
      ["crs:LuminanceOrange", integerString(s.luminanceOrange)],
      ["crs:LuminanceYellow", integerString(s.luminanceYellow)],
      ["crs:LuminanceGreen", integerString(s.luminanceGreen)],
      ["crs:LuminanceAqua", integerString(s.luminanceAqua)],
      ["crs:LuminanceBlue", integerString(s.luminanceBlue)],
      ["crs:LuminancePurple", integerString(s.luminancePurple)],
      ["crs:LuminanceMagenta", integerString(s.luminanceMagenta)],
      ["crs:PostCropVignetteAmount", integerString(s.vignette)],
      ["crs:GrainAmount", integerString(s.grain)],
      ["crs:ToneCurveName2012", "Linear"],
      ["crs:LookTable", ""],
    ];

    const attrText = attrs
      .map(([key, value]) => `      ${key}="${value}"`)
      .join("\n");

    return `<?xpacket begin="${"\uFEFF"}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
${attrText}
    />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }
}

const FUJI_XMP_PRESETS = {
  none: {
    label: "None",
    adjustments: {},
  },
  luke_pro_400h: {
    label: "Luke Pro 400H (Official)",
    mode: "absolute",
    source: "presets/luke/Lukes-Fuji-Pro-400H-Preset.xmp",
    settings: {
      exposure: 0.31,
      contrast: 10,
      highlights: -75,
      shadows: 56,
      whites: 5,
      blacks: -15,
      temperature: 5850,
      tint: 20,
      vibrance: -10,
      saturation: 2,
      clarity: 5,
      texture: 4,
      grain: 55,
      hueRed: -23,
      hueOrange: -33,
      hueYellow: -9,
      hueGreen: 40,
      hueAqua: -15,
      hueBlue: -25,
      huePurple: 0,
      hueMagenta: 0,
      saturationRed: 15,
      saturationOrange: -10,
      saturationYellow: -21,
      saturationGreen: -57,
      saturationAqua: -15,
      saturationBlue: -25,
      saturationPurple: 0,
      saturationMagenta: 0,
      luminanceRed: 17,
      luminanceOrange: 0,
      luminanceYellow: 40,
      luminanceGreen: 0,
      luminanceAqua: 0,
      luminanceBlue: 5,
      luminancePurple: 0,
      luminanceMagenta: 0,
    },
  },
  luke_cool_chrome: {
    label: "Luke Cool Chrome (Official)",
    mode: "absolute",
    source: "presets/luke/Fujifilm-Cool-Color-Preset.xmp",
    settings: {
      exposure: 0.36,
      contrast: 19,
      highlights: -50,
      shadows: 14,
      whites: -11,
      blacks: -12,
      vibrance: -5,
      saturation: -10,
      clarity: 0,
    },
  },
  luke_natura_1600: {
    label: "Luke Natura 1600 (Official)",
    mode: "absolute",
    source: "presets/luke/Natura-1600.xmp",
    settings: {
      exposure: 0.19,
      contrast: 25,
      vibrance: 5,
      hueRed: 7,
      hueOrange: 0,
      hueYellow: 35,
      hueGreen: 0,
      hueAqua: 0,
      hueBlue: -17,
      huePurple: 0,
      hueMagenta: 0,
      saturationRed: 2,
      saturationOrange: -15,
      saturationYellow: -25,
      saturationGreen: 0,
      saturationAqua: -45,
      saturationBlue: -30,
      saturationPurple: 0,
      saturationMagenta: 0,
      luminanceRed: -28,
      luminanceOrange: 20,
      luminanceYellow: 18,
      luminanceGreen: -25,
      luminanceAqua: 0,
      luminanceBlue: -7,
      luminancePurple: 0,
      luminanceMagenta: 0,
    },
  },
  provia: {
    label: "Provia / Standard",
    adjustments: {
      contrast: 4,
      vibrance: 6,
      saturation: 2,
      hueBlue: -2,
      saturationBlue: 8,
      saturationGreen: 5,
    },
  },
  velvia: {
    label: "Velvia / Vivid",
    adjustments: {
      contrast: 14,
      vibrance: 22,
      saturation: 18,
      highlights: -8,
      shadows: 6,
      hueBlue: -4,
      saturationBlue: 24,
      saturationGreen: 12,
      luminanceBlue: -8,
    },
  },
  astia: {
    label: "Astia / Soft",
    adjustments: {
      contrast: -12,
      highlights: -8,
      shadows: 16,
      vibrance: 8,
      saturation: -4,
      tint: 4,
      hueOrange: -4,
      saturationOrange: 10,
      luminanceOrange: 8,
      saturationBlue: -6,
    },
  },
  classic_chrome: {
    label: "Classic Chrome",
    adjustments: {
      contrast: 10,
      highlights: -12,
      shadows: 14,
      vibrance: -22,
      saturation: -18,
      hueBlue: -12,
      saturationBlue: -24,
      luminanceBlue: -18,
      saturationGreen: -20,
      hueYellow: 6,
      grain: 18,
      vignette: -16,
    },
  },
  pro_400h: {
    label: "Pro 400H",
    adjustments: {
      contrast: -10,
      highlights: -16,
      shadows: 18,
      vibrance: 6,
      saturation: -8,
      temperature: -250,
      tint: 6,
      hueGreen: -6,
      saturationGreen: -10,
      hueBlue: -4,
      saturationBlue: -8,
      luminanceOrange: 10,
      grain: 20,
    },
  },
  pro_neg_hi: {
    label: "Pro Neg. Hi",
    adjustments: {
      contrast: 18,
      highlights: -8,
      shadows: 10,
      vibrance: -4,
      saturation: -8,
      temperature: 120,
      tint: 2,
      saturationOrange: 6,
      luminanceOrange: 8,
    },
  },
  pro_neg_std: {
    label: "Pro Neg. Std",
    adjustments: {
      contrast: 6,
      highlights: -6,
      shadows: 12,
      vibrance: -2,
      saturation: -6,
      temperature: 80,
      tint: 1,
      saturationOrange: 4,
      luminanceOrange: 6,
    },
  },
  eterna: {
    label: "Eterna",
    adjustments: {
      contrast: -16,
      highlights: -12,
      shadows: 10,
      vibrance: -24,
      saturation: -22,
      dehaze: -4,
      hueBlue: -8,
      saturationBlue: -18,
      luminanceBlue: -10,
      saturationGreen: -12,
    },
  },
  acros: {
    label: "Acros",
    adjustments: {
      saturation: -100,
      vibrance: -100,
      contrast: 18,
      highlights: -20,
      shadows: 24,
      texture: 20,
      clarity: 18,
      grain: 28,
      vignette: -20,
    },
  },
};

function applyPresetStyle(settings, presetKey, strength) {
  const style = {
    film: {
      highlights: -12,
      shadows: 14,
      saturation: -6,
      grain: 22,
      vignette: -18,
      hueYellow: -6,
    },
    cinematic: {
      contrast: 10,
      dehaze: 8,
      saturationBlue: -12,
      hueBlue: -8,
      vignette: -16,
    },
    ecom: {
      exposure: 0.2,
      whites: 12,
      shadows: 10,
      clarity: 6,
      saturation: -4,
    },
    social: {
      contrast: 12,
      vibrance: 10,
      saturation: 8,
      clarity: 10,
      dehaze: 4,
    },
  }[presetKey];

  if (!style) return;
  for (const [key, value] of Object.entries(style)) {
    settings[key] += value * strength;
  }
}

function normalizeSettings(settings) {
  settings.exposure = clamp(settings.exposure, -5, 5);
  settings.contrast = clamp(settings.contrast, -100, 100);
  settings.highlights = clamp(settings.highlights, -100, 100);
  settings.shadows = clamp(settings.shadows, -100, 100);
  settings.whites = clamp(settings.whites, -100, 100);
  settings.blacks = clamp(settings.blacks, -100, 100);
  settings.temperature = clamp(settings.temperature, 2000, 50000);
  settings.tint = clamp(settings.tint, -150, 150);
  settings.vibrance = clamp(settings.vibrance, -100, 100);
  settings.saturation = clamp(settings.saturation, -100, 100);
  settings.clarity = clamp(settings.clarity, -100, 100);
  settings.dehaze = clamp(settings.dehaze, -100, 100);
  settings.texture = clamp(settings.texture, -100, 100);
  settings.vignette = clamp(settings.vignette, -100, 100);
  settings.grain = clamp(settings.grain, 0, 100);

  const hslKeys = [
    "hueRed",
    "hueOrange",
    "hueYellow",
    "hueGreen",
    "hueAqua",
    "hueBlue",
    "huePurple",
    "hueMagenta",
    "saturationRed",
    "saturationOrange",
    "saturationYellow",
    "saturationGreen",
    "saturationAqua",
    "saturationBlue",
    "saturationPurple",
    "saturationMagenta",
    "luminanceRed",
    "luminanceOrange",
    "luminanceYellow",
    "luminanceGreen",
    "luminanceAqua",
    "luminanceBlue",
    "luminancePurple",
    "luminanceMagenta",
  ];

  for (const key of hslKeys) {
    settings[key] = clamp(settings[key], -100, 100);
  }
  return settings;
}

function integerString(value) {
  return String(Math.round(value));
}

function toNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

window.XMPGenerator = XMPGenerator;
