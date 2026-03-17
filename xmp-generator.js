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
