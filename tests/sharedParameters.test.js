import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, getGeometryModel } from '../src/model.js';
import {
  createSharedParameters,
  updateSharedFromCalculator,
  updateSharedFromVisualizer,
} from '../src/sharedParameters.js';
import { listenForParameterMessages, postParameterMessage } from '../src/parameterMessages.js';

const section = { type: 'H', model: '200X200', IxMm4: 10_000_000, WxMm3: 100_000, selfWeightKNm: 0.2 };
const calculatorData = () => ({
  beamSection: section,
  beamElasticModulusNmm2: 200_000,
  beamAllowableBendingStressNmm2: 145,
  beamDeflectionLimitMm: 10,
  layers: [
    { pipes: [{ code: 'HV', spec: 'DN100', diameterMm: 100, lineLoadKNm: 0.25, widthMm: 200 }] },
    { pipes: [{ code: 'CS', spec: 'DN200', diameterMm: 200, lineLoadKNm: 0.5, widthMm: 280 }] },
    { pipes: [{ code: 'PIPE', spec: 'DN80', diameterMm: 80, lineLoadKNm: 0.15, widthMm: 160 }] },
  ],
  extraLoads: [{ lineKNm: 0.1, pointKN: 1 }, { lineKNm: 0, pointKN: 2 }, { lineKNm: 0.3, pointKN: 0 }],
});

test('visualizer geometry initializes and updates shared calculator width, hanger, and levels', () => {
  let shared = createSharedParameters(DEFAULT_CONFIG, calculatorData());
  assert.equal(shared.calculator.beamWidthOverrideMm, DEFAULT_CONFIG.beamWidth);
  assert.equal(shared.calculator.rodDiameterMm, DEFAULT_CONFIG.hanger.diameter);
  assert.deepEqual(shared.calculator.layerElevationsMm, [2400, 1800, 1200]);

  const visual = structuredClone(DEFAULT_CONFIG);
  visual.beamWidth = 1800;
  visual.hanger.diameter = 24;
  visual.levels = [
    { id: 'level-a', elevation: 3000 },
    { id: 'level-b', elevation: 2200 },
  ];
  shared = updateSharedFromVisualizer(shared, visual);

  assert.equal(shared.calculator.beamWidthOverrideMm, 1800);
  assert.equal(shared.calculator.rodDiameterMm, 24);
  assert.deepEqual(shared.calculator.layerElevationsMm, [3000, 2200]);
  assert.equal(shared.calculator.layers.length, 2);
  assert.deepEqual(shared.calculator.layers[1].pipes[0], calculatorData().layers[1].pipes[0]);
  assert.deepEqual(shared.calculator.extraLoads[1], { lineKNm: 0, pointKN: 2 });
  assert.equal(shared.calculator.overflowLayers[0].pipes[0].code, 'PIPE');
  assert.equal(shared.calculator.beamSection.model, '200X200');
  assert.match(shared.notices.join(' '), /不联动.*角钢/);
});

test('calculator width, hanger, layer count, and elevations update visualization geometry', () => {
  const current = createSharedParameters(DEFAULT_CONFIG, calculatorData());
  const parameters = {
    ...calculatorData(),
    beamWidthOverrideMm: 2100,
    rodDiameterMm: 30,
    layerElevationsMm: [2800, 1900, 900, 400],
    layers: calculatorData().layers.concat({ pipes: [{ code: 'HV', spec: 'DN50', diameterMm: 50, lineLoadKNm: 0.1, widthMm: 100 }] }),
    extraLoads: calculatorData().extraLoads.concat({ lineKNm: 0, pointKN: 0 }),
  };
  const updated = updateSharedFromCalculator(current, parameters);
  assert.equal(updated.visual.beamWidth, 2100);
  assert.equal(updated.visual.hanger.diameter, 30);
  assert.deepEqual(updated.visual.levels.map(({ elevation }) => elevation), [2800, 1900, 900, 400]);
  assert.equal(updated.visual.beam.type, 'angle');
  assert.equal(updated.visual.beam.leg, DEFAULT_CONFIG.beam.leg);
  assert.equal(getGeometryModel(updated.visual).width, 2100);
  assert.equal(updated.calculator.beamSection.model, '200X200');
});

test('unsupported visual level counts retain calculator-only pipe and load records with a notice', () => {
  let shared = createSharedParameters(DEFAULT_CONFIG, calculatorData());
  const visual = structuredClone(DEFAULT_CONFIG);
  visual.levels = Array.from({ length: 6 }, (_, index) => ({
    id: `six-${index}`,
    elevation: 7000 - index * 700,
  }));
  shared = updateSharedFromVisualizer(shared, visual);
  assert.equal(shared.calculator.layers.length, 3);
  assert.equal(shared.calculator.layers[2].pipes[0].code, 'PIPE');
  assert.match(shared.notices.join(' '), /支持 2–5 层.*予以保留/);
});

test('reducing calculator layer count retains removed pipe and extra-load data for later restoration', () => {
  const current = createSharedParameters(DEFAULT_CONFIG, calculatorData());
  const reduced = updateSharedFromCalculator(current, {
    ...calculatorData(),
    layers: calculatorData().layers.slice(0, 2),
    extraLoads: calculatorData().extraLoads.slice(0, 2),
    layerElevationsMm: [2400, 1800],
  });
  assert.equal(reduced.calculator.layers.length, 2);
  assert.equal(reduced.calculator.overflowLayers[0].pipes[0].code, 'PIPE');
  assert.deepEqual(reduced.calculator.overflowExtraLoads[0], { lineKNm: 0.3, pointKN: 0 });
  const restored = updateSharedFromVisualizer(reduced, DEFAULT_CONFIG);
  assert.equal(restored.calculator.layers[2].pipes[0].code, 'PIPE');
  assert.deepEqual(restored.calculator.extraLoads[2], { lineKNm: 0.3, pointKN: 0 });
});

test('invalid calculator geometry is not applied but calculator inputs remain available', () => {
  const current = createSharedParameters(DEFAULT_CONFIG, calculatorData());
  const updated = updateSharedFromCalculator(current, {
    ...calculatorData(),
    beamWidthOverrideMm: 10,
    rodDiameterMm: 70,
    layerElevationsMm: [100, 100],
  });
  assert.equal(updated.visual.beamWidth, DEFAULT_CONFIG.beamWidth);
  assert.equal(updated.visual.hanger.diameter, DEFAULT_CONFIG.hanger.diameter);
  assert.deepEqual(updated.visual.levels.map(({ elevation }) => elevation), [2400, 1800, 1200]);
  assert.equal(updated.calculator.beamWidthOverrideMm, 10);
  assert.match(updated.notices.join(' '), /几何参数未同步/);
});

test('postMessage protocol carries both directions and rejects untrusted sources', () => {
  const origin = 'https://supports.example';
  const visualWindow = new EventTarget();
  const calculatorWindow = new EventTarget();
  let messagesSent = 0;
  visualWindow.postMessage = (data, targetOrigin) => {
    assert.equal(targetOrigin, origin);
    messagesSent += 1;
    const event = new Event('message');
    Object.defineProperties(event, {
      data: { value: structuredClone(data) },
      origin: { value: origin },
      source: { value: visualWindow },
      targetOrigin: { value: targetOrigin },
    });
    calculatorWindow.dispatchEvent(event);
  };
  calculatorWindow.postMessage = (data, targetOrigin) => {
    assert.equal(targetOrigin, origin);
    messagesSent += 1;
    const event = new Event('message');
    Object.defineProperties(event, {
      data: { value: structuredClone(data) },
      origin: { value: origin },
      source: { value: calculatorWindow },
      targetOrigin: { value: targetOrigin },
    });
    visualWindow.dispatchEvent(event);
  };

  let shared = createSharedParameters(DEFAULT_CONFIG, calculatorData());
  let visualUpdates = 0;
  const stopCalculator = listenForParameterMessages(calculatorWindow, {
    expectedOrigin: origin,
    expectedSource: visualWindow,
    handlers: {
      'visual-parameters': (message) => {
        shared = message.parameters;
      },
    },
  });
  const stopVisualizer = listenForParameterMessages(visualWindow, {
    expectedOrigin: origin,
    expectedSource: calculatorWindow,
    handlers: {
      'calculator-parameters': (message) => {
        shared = updateSharedFromCalculator(shared, message.parameters);
        visualUpdates += 1;
      },
    },
  });

  const changedVisual = structuredClone(DEFAULT_CONFIG);
  changedVisual.beamWidth = 1750;
  changedVisual.hanger.diameter = 22;
  shared = updateSharedFromVisualizer(shared, changedVisual);
  postParameterMessage(visualWindow, origin, 'visual-parameters', shared);
  assert.equal(shared.calculator.beamWidthOverrideMm, 1750);
  assert.equal(messagesSent, 1);

  postParameterMessage(calculatorWindow, origin, 'calculator-parameters', {
    ...calculatorData(),
    beamWidthOverrideMm: 1900,
    calculatedWidthMm: 2100,
    rodDiameterMm: 30,
    layerElevationsMm: [2600, 1700, 800],
  });
  assert.equal(visualUpdates, 1);
  assert.equal(shared.visual.beamWidth, 2100);
  assert.equal(shared.visual.hanger.diameter, 30);
  assert.deepEqual(shared.visual.levels.map(({ elevation }) => elevation), [2600, 1700, 800]);
  assert.equal(getGeometryModel(shared.visual).width, 2100);
  assert.equal(messagesSent, 2, 'receiving and applying parent parameters must not echo a new message');

  const untrusted = new Event('message');
  Object.defineProperties(untrusted, {
    data: { value: { type: 'calculator-parameters', parameters: { beamWidthOverrideMm: 2500 } } },
    origin: { value: 'https://attacker.example' },
    source: { value: calculatorWindow },
  });
  visualWindow.dispatchEvent(untrusted);
  assert.equal(shared.visual.beamWidth, 2100);
  const unexpectedSource = new Event('message');
  Object.defineProperties(unexpectedSource, {
    data: { value: { type: 'calculator-parameters', parameters: { beamWidthOverrideMm: 2500 } } },
    origin: { value: origin },
    source: { value: {} },
  });
  visualWindow.dispatchEvent(unexpectedSource);
  assert.equal(shared.visual.beamWidth, 2100);
  stopCalculator();
  stopVisualizer();
});
