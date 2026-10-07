import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMultiHang,
  LEGACY_KGF_TO_KN,
  legacyKgPerMToKNPerM,
  pipeCatalogEntryToCalculationInput,
  validateMultiHangInput,
} from '../src/calculator/calculation.js';
import { PIPE_CATALOG } from '../src/calculator/pipeCatalog.js';

const example = {
  spacingMm: 3000,
  minWidthMm: 0,
  beamSelfWeightKNm: 0,
  rodDiameterMm: 16,
  rodSteel: 'Q235',
  layers: [
    { pipes: [{ diameterMm: 100, lineLoadKNm: 0.2, widthMm: 150 }] },
    { pipes: [{ diameterMm: 150, lineLoadKNm: 0.35, widthMm: 200 }] },
    { pipes: [{ diameterMm: 80, lineLoadKNm: 0.15, widthMm: 120 }] },
  ],
  extraLoads: Array.from({ length: 3 }, () => ({ lineKNm: 0, pointKN: 0 })),
};

const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} should be close to ${expected}`);

test('legacy mass load uses the explicit Tab 2 coefficient and kN/m thereafter', () => {
  assert.equal(LEGACY_KGF_TO_KN, 0.01);
  assert.ok(Math.abs(legacyKgPerMToKNPerM(35) - 0.35) < 1e-12);
});

test('extracted pipe catalog preserves Tab 2 types/specs and converts legacy pipe weights explicitly', () => {
  assert.equal(PIPE_CATALOG.pipes.length, 124);
  assert.equal(new Set(PIPE_CATALOG.pipes.map((pipe) => pipe.code)).size, 13);
  assert.equal(PIPE_CATALOG.legacyUnits.weight, 'kg/m');
  const hvDn100 = PIPE_CATALOG.pipes.find((pipe) => pipe.code === 'HV' && pipe.spec === 'DN100');
  assert.ok(hvDn100);
  assert.deepEqual(pipeCatalogEntryToCalculationInput(hvDn100), {
    diameterMm: 100,
    lineLoadKNm: 0.25,
    widthMm: 200,
  });
});

test('multi-layer width, pipe loads, internal forces, and hanger stress use mm and kN', () => {
  const result = calculateMultiHang(example);
  assert.deepEqual(result.layerWidthsMm, [300, 300, 300]);
  assert.equal(result.widthMm, 300);
  approximately(result.layers[0].pipePointLoadKN, 0.6);
  approximately(result.layers[0].distributedPipeLoadKNm, 2);
  approximately(result.layers[0].momentKNm, 0.0585);
  approximately(result.layers[1].pipePointLoadKN, 1.05);
  approximately(result.rodAreaMm2, Math.PI * 16 ** 2 / 4);
  assert.equal(result.beamChecksAvailable, false);
  assert.ok(result.rodStressNmm2 > 0);
});

test('manual minimum width and additional forces affect load and rod checks', () => {
  const withExtras = structuredClone(example);
  withExtras.minWidthMm = 900;
  withExtras.extraLoads[0] = { lineKNm: 0.1, pointKN: 0.5 };
  const result = calculateMultiHang(withExtras);
  assert.equal(result.widthMm, 900);
  assert.ok(result.layers[0].momentKNm > calculateMultiHang(example).layers[0].momentKNm);
  assert.ok(result.loadPerRodKN > calculateMultiHang(example).loadPerRodKN);
});

test('invalid layer count, diameter, load, and steel are rejected', () => {
  const invalid = structuredClone(example);
  invalid.layers[0].pipes[0].diameterMm = 0;
  invalid.layers[0].pipes[0].lineLoadKNm = -1;
  invalid.rodSteel = 'Q999';
  const result = validateMultiHangInput(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /直径/);
  assert.match(result.errors.join(' '), /线荷载/);
  assert.match(result.errors.join(' '), /Q235 或 Q345/);
  const invalidLayerCount = validateMultiHangInput({ ...example, layers: example.layers.slice(0, 1) });
  assert.match(invalidLayerCount.errors.join(' '), /2–5 层/);
});

test('calculation rejects invalid data rather than returning a success-shaped result', () => {
  assert.throws(() => calculateMultiHang({ ...example, spacingMm: 0 }), /吊架间距/);
  const zeroLoad = structuredClone(example);
  zeroLoad.layers.forEach((layer) => layer.pipes.forEach((pipe) => { pipe.lineLoadKNm = 0; }));
  assert.throws(() => calculateMultiHang(zeroLoad), /大于 0 的管道线荷载/);
  assert.equal(validateMultiHangInput({ ...example, layers: [null, ...example.layers.slice(1)] }).valid, false);
});
