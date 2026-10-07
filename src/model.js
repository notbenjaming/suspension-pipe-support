export const DEFAULT_CONFIG = {
  schemaVersion: 1,
  beamWidth: 1200,
  hanger: { type: 'round-bar', diameter: 20 },
  beam: { type: 'angle', leg: 50, thickness: 5 },
  levels: [{ id: 'level-1', elevation: 2400 }, { id: 'level-2', elevation: 1800 }, { id: 'level-3', elevation: 1200 }],
  guideLines: { count: 3, spacing: 350 },
};

export const HANGER_PRESETS = [12, 16, 20, 24, 30];
export const BEAM_PRESETS = [{ label: 'L50×5', leg: 50, thickness: 5 }, { label: 'L40×4', leg: 40, thickness: 4 }, { label: 'L63×6', leg: 63, thickness: 6 }];

export function validateConfig(input) {
  const errors = [];
  const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['配置必须是 JSON 对象。'] };
  }
  if (!isNumber(input.beamWidth) || input.beamWidth < 200 || input.beamWidth > 6000) {
    errors.push('支架宽度 B 应为 200–6000 mm。');
  }
  if (!input.hanger || input.hanger.type !== 'round-bar' || !isNumber(input.hanger.diameter) || input.hanger.diameter < 8 || input.hanger.diameter > 60) {
    errors.push('吊杆须为圆钢，直径应为 8–60 mm。');
  }
  if (!input.beam || input.beam.type !== 'angle' || !isNumber(input.beam.leg) || !isNumber(input.beam.thickness) ||
    input.beam.leg < 20 || input.beam.leg > 150 || input.beam.thickness < 2 || input.beam.thickness > 16 ||
    input.beam.thickness >= input.beam.leg / 2) {
    errors.push('角钢边长应为 20–150 mm，厚度为 2–16 mm 且小于边长的一半。');
  }
  if (!Array.isArray(input.levels) || input.levels.length < 1 || input.levels.length > 8) {
    errors.push('横梁层数应为 1–8 层。');
  } else {
    input.levels.forEach((level, index) => {
      if (!level || !isNumber(level.elevation) || level.elevation < 200 || level.elevation > 10000) {
        errors.push(`第 ${index + 1} 层标高应为 200–10000 mm。`);
      }
    });
    if (input.levels.every((level) => level && isNumber(level.elevation))) {
      const elevations = input.levels.map((level) => level.elevation);
      if (new Set(elevations).size !== elevations.length) errors.push('各层标高不能重复。');
      if (elevations.some((elevation, i) => elevations.some((other, j) => i !== j && Math.abs(elevation - other) < 100))) {
        errors.push('相邻横梁标高至少间隔 100 mm。');
      }
    }
  }
  if (!input.guideLines || !Number.isInteger(input.guideLines.count) || input.guideLines.count < 1 || input.guideLines.count > 8 ||
    !isNumber(input.guideLines.spacing) || input.guideLines.spacing < 100 || input.guideLines.spacing > 2000) {
    errors.push('示意管线应为 1–8 条，间距为 100–2000 mm。');
  }
  return { valid: errors.length === 0, errors };
}

export function getGeometryModel(config) {
  const validation = validateConfig(config);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const elevations = config.levels.map(({ elevation }) => elevation);
  const sorted = [...elevations].sort((a, b) => a - b);
  return {
    width: config.beamWidth,
    hangerPositions: [-config.beamWidth / 2, config.beamWidth / 2],
    rodStart: Math.max(...elevations) + 450,
    rodEnd: Math.min(...elevations),
    levels: config.levels.map((level) => ({ ...level, beamLength: config.beamWidth })),
    guideLinePositions: Array.from({ length: config.guideLines.count }, (_, index) =>
      (index - (config.guideLines.count - 1) / 2) * config.guideLines.spacing),
    overallHeight: sorted.at(-1) + 450,
  };
}

export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}
