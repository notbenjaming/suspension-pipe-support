import { cloneConfig, DEFAULT_CONFIG, validateConfig } from './model.js';

const CALCULATOR_LAYER_MIN = 2;
const CALCULATOR_LAYER_MAX = 5;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function newLevelId(index, usedIds) {
  let suffix = index + 1;
  while (usedIds.has(`level-${suffix}`)) suffix += 1;
  const id = `level-${suffix}`;
  usedIds.add(id);
  return id;
}

function resizedLayers(calculator, count) {
  const layers = [...(calculator.layers ?? []), ...(calculator.overflowLayers ?? [])].map(clone);
  while (layers.length < count) {
    layers.push(clone(layers.at(-1) ?? { pipes: [] }));
  }
  calculator.layers = layers.slice(0, count);
  calculator.overflowLayers = layers.slice(count);

  const extraLoads = [...(calculator.extraLoads ?? []), ...(calculator.overflowExtraLoads ?? [])].map(clone);
  while (extraLoads.length < count) extraLoads.push(clone(extraLoads.at(-1) ?? { lineKNm: 0, pointKN: 0 }));
  calculator.extraLoads = extraLoads.slice(0, count);
  calculator.overflowExtraLoads = extraLoads.slice(count);

  const elevations = [
    ...(calculator.layerElevationsMm ?? []),
    ...(calculator.overflowLayerElevationsMm ?? []),
  ];
  while (elevations.length < count) elevations.push((elevations.at(-1) ?? 1800) - 600);
  calculator.layerElevationsMm = elevations.slice(0, count);
  calculator.overflowLayerElevationsMm = elevations.slice(count);
}

export function createSharedParameters(visualConfig = DEFAULT_CONFIG, calculator = {}) {
  const visual = cloneConfig(visualConfig);
  const state = {
    schemaVersion: 1,
    visual,
    calculator: {
      ...clone(calculator),
      beamWidthOverrideMm: visual.beamWidth,
      rodDiameterMm: visual.hanger.diameter,
      layerElevationsMm: visual.levels.map(({ elevation }) => elevation),
      layers: clone(calculator.layers ?? []),
      overflowLayers: clone(calculator.overflowLayers ?? []),
      extraLoads: clone(calculator.extraLoads ?? []),
      overflowExtraLoads: clone(calculator.overflowExtraLoads ?? []),
      overflowLayerElevationsMm: clone(calculator.overflowLayerElevationsMm ?? []),
    },
    notices: [],
  };
  if (visual.levels.length >= CALCULATOR_LAYER_MIN && visual.levels.length <= CALCULATOR_LAYER_MAX) {
    resizedLayers(state.calculator, visual.levels.length);
  } else {
    state.notices.push(`可视化当前为 ${visual.levels.length} 层；计算器支持 2–5 层，计算器分层荷载暂不联动。`);
  }
  state.notices.push('横梁截面不联动：可视化使用角钢，计算器型钢库仅支持槽钢 / H 型钢。');
  return state;
}

export function updateSharedFromVisualizer(current, visualConfig) {
  const next = clone(current);
  next.visual = cloneConfig(visualConfig);
  next.notices = ['横梁截面不联动：可视化使用角钢，计算器型钢库仅支持槽钢 / H 型钢。'];
  next.calculator.beamWidthOverrideMm = visualConfig.beamWidth;
  next.calculator.calculatedWidthMm = null;
  next.calculator.rodDiameterMm = visualConfig.hanger.diameter;

  const elevations = visualConfig.levels.map(({ elevation }) => elevation);
  if (elevations.length >= CALCULATOR_LAYER_MIN && elevations.length <= CALCULATOR_LAYER_MAX) {
    resizedLayers(next.calculator, elevations.length);
    next.calculator.layerElevationsMm = elevations;
  } else {
    next.notices.push(`可视化当前为 ${elevations.length} 层；计算器支持 2–5 层，计算器分层荷载暂不联动并予以保留。`);
  }
  return next;
}

export function updateSharedFromCalculator(current, calculatorParameters) {
  const next = clone(current);
  const incoming = clone(calculatorParameters);
  for (const [activeKey, overflowKey] of [
    ['layers', 'overflowLayers'],
    ['extraLoads', 'overflowExtraLoads'],
    ['layerElevationsMm', 'overflowLayerElevationsMm'],
  ]) {
    const previousActive = next.calculator[activeKey] ?? [];
    const newActive = incoming[activeKey] ?? [];
    if (newActive.length < previousActive.length) {
      incoming[overflowKey] = [
        ...(incoming[overflowKey] ?? []),
        ...previousActive.slice(newActive.length),
      ];
    }
  }
  const calculator = {
    ...next.calculator,
    ...incoming,
  };
  const notices = ['横梁截面不联动：计算器型钢选择不会改变可视化角钢截面。'];
  if (Array.isArray(calculator.layerElevationsMm) &&
      calculator.layerElevationsMm.length >= CALCULATOR_LAYER_MIN &&
      calculator.layerElevationsMm.length <= CALCULATOR_LAYER_MAX) {
    resizedLayers(calculator, calculator.layerElevationsMm.length);
    calculator.layerElevationsMm = incoming.layerElevationsMm;
  }
  const candidate = cloneConfig(next.visual);
  const calculatedWidth = calculator.calculatedWidthMm;
  const width = typeof calculatedWidth === 'number' && Number.isFinite(calculatedWidth)
    ? calculatedWidth
    : calculator.beamWidthOverrideMm;
  const diameter = calculator.rodDiameterMm;
  const elevations = calculator.layerElevationsMm;

  if (typeof width === 'number' && Number.isFinite(width)) candidate.beamWidth = width;
  else notices.push('支架宽度未同步：计算器宽度不是有效数值。');

  if (typeof diameter === 'number' && Number.isFinite(diameter)) candidate.hanger.diameter = diameter;
  else notices.push('吊杆直径未同步：计算器直径不是有效数值。');

  if (Array.isArray(elevations) && elevations.length >= 1 && elevations.length <= 8 &&
      elevations.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    const usedIds = new Set();
    candidate.levels = elevations.map((elevation, index) => {
      const id = next.visual.levels[index]?.id ?? newLevelId(index, usedIds);
      usedIds.add(id);
      return { id, elevation };
    });
  } else {
    notices.push('横梁层数 / 标高未同步：计算器层数超出可视化支持范围或标高数据无效。');
  }

  const validation = validateConfig(candidate);
  if (validation.valid) next.visual = candidate;
  else notices.push(`几何参数未同步：${validation.errors.join(' ')}`);

  next.calculator = calculator;
  next.notices = notices;
  return next;
}
