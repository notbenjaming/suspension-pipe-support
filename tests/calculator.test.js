import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateMultiHang,
  LEGACY_KGF_TO_KN,
  legacyKgPerMToKNPerM,
  pipeCatalogEntryToCalculationInput,
  validateMultiHangInput,
} from '../src/calculator/calculation.js';
import { PIPE_CATALOG } from '../src/calculator/pipeCatalog.js';
import { parseSteelCatalog, STEEL_KG_M_TO_KN_M } from '../src/calculator/steelCatalog.js';

const steelData = JSON.parse(readFileSync(
  new URL('../public/steel_query_package/steel_data.json', import.meta.url),
  'utf8',
));

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

test('shared beam width sets a minimum calculation span and rejects unsupported dimensions', () => {
  const result = calculateMultiHang({ ...structuredClone(example), beamWidthOverrideMm: 1200 });
  assert.equal(result.widthMm, 1200);
  const invalid = validateMultiHangInput({ ...example, beamWidthOverrideMm: 7000 });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(' '), /共享支架宽度/);
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

test('steel dataset loads only complete C/H sections and converts section units explicitly', () => {
  const catalog = parseSteelCatalog(steelData);
  assert.equal(steelData.data.length, 821);
  assert.equal(catalog.sections.length, 108);
  assert.deepEqual(
    Object.fromEntries(['C', 'H'].map((type) => [
      type,
      catalog.sections.filter((section) => section.type === type).length,
    ])),
    { C: 52, H: 56 },
  );
  assert.deepEqual(catalog.unavailable, []);
  assert.ok(catalog.sections.every((section) =>
    ['C', 'H'].includes(section.type) &&
    section.IxMm4 > 0 && section.WxMm3 > 0 && section.selfWeightKNm > 0));
  const channel = catalog.sections.find((section) => section.model === 'C5');
  assert.equal(channel.IxMm4, 260000);
  assert.equal(channel.WxMm3, 10400);
  approximately(channel.selfWeightKNm, 5.44 * STEEL_KG_M_TO_KN_M);
});

test('steel catalog reports absent, malformed, unsupported, and incomplete data without defaults', () => {
  assert.throws(() => parseSteelCatalog({ metadata: {}, records: [] }), /缺少 data 数组/);
  assert.throws(() => parseSteelCatalog({ data: [], metadata: { total_records: 1 } }), /记录数/);
  assert.throws(() => parseSteelCatalog({ data: [{ type: 'L', model: 'L50x5' }] }), /没有可用于横梁校核/);
  const catalog = parseSteelCatalog({
    data: [
      { type: 'C', model: 'C-incomplete', Ix: 100, weight: 1 },
      { type: 'H', model: 'H-valid', Ix: 100, Wx: 20, weight: 1 },
      { type: 'L', model: 'L-not-supported', Ix: 100, Wx: 20, weight: 1 },
    ],
  });
  assert.equal(catalog.sections.length, 1);
  assert.equal(catalog.unavailable.length, 1);
  assert.deepEqual(catalog.unavailable[0].missing, ['Wx']);
});

test('selected H section checks bending stress and simply-supported beam deflection', () => {
  const section = {
    type: 'H',
    typeLabel: 'H 型钢',
    model: 'TEST',
    IxCm4: 100,
    WxCm3: 50,
    IxMm4: 1_000_000,
    WxMm3: 50_000,
    selfWeightKNm: 0.02,
  };
  const input = {
    ...structuredClone(example),
    beamSection: section,
    beamElasticModulusNmm2: 200_000,
    beamAllowableBendingStressNmm2: 100,
    beamDeflectionLimitMm: 1,
  };
  const result = calculateMultiHang(input);
  const firstLayer = result.layers[0];
  const firstCheck = result.beamChecks.layers[0];
  assert.equal(result.beamChecksAvailable, true);
  approximately(result.sectionSelfWeightKNm, 0.02);
  approximately(firstLayer.selfWeightKNm, 0.02);
  approximately(firstCheck.bendingStressNmm2, firstLayer.momentKNm * 1e6 / section.WxMm3);
  const spanMm = result.widthMm;
  const q = firstLayer.distributedPipeLoadKNm + firstLayer.extraLineKNm + firstLayer.selfWeightKNm;
  const point = firstLayer.pipePointLoadKN + firstLayer.extraPointKN +
    firstLayer.selfWeightKNm * result.spanM;
  const expectedDeflection = Math.max(
    5 * q * spanMm ** 4 / (384 * input.beamElasticModulusNmm2 * section.IxMm4),
    point * 1000 * spanMm ** 3 / (48 * input.beamElasticModulusNmm2 * section.IxMm4),
  ) * 1.3;
  approximately(firstCheck.deflectionMm, expectedDeflection);
  assert.equal(firstCheck.strengthPass, true);
  assert.equal(firstCheck.deflectionPass, true);

  const failed = calculateMultiHang({
    ...input,
    beamAllowableBendingStressNmm2: 0.01,
    beamDeflectionLimitMm: 0.0001,
  });
  assert.equal(failed.beamChecks.layers[0].strengthPass, false);
  assert.equal(failed.beamChecks.layers[0].deflectionPass, false);
});

test('selected C channel uses its own x-axis properties and catalog self-weight', () => {
  const channel = parseSteelCatalog(steelData).sections.find((section) =>
    section.type === 'C' && section.model === 'C5');
  const result = calculateMultiHang({
    ...structuredClone(example),
    beamSection: channel,
    beamElasticModulusNmm2: 200_000,
    beamAllowableBendingStressNmm2: 100,
    beamDeflectionLimitMm: 10,
  });
  assert.equal(result.beamChecks.section, 'C 槽钢 C5');
  assert.equal(result.beamChecksAvailable, true);
  assert.ok(result.beamChecks.layers.every((layer) =>
    Number.isFinite(layer.bendingStressNmm2) && Number.isFinite(layer.deflectionMm)));
});

test('beam check limits and missing section properties remain explicitly indeterminate', () => {
  const section = {
    type: 'C',
    model: 'PARTIAL',
    WxMm3: 50_000,
    IxMm4: 1_000_000,
    selfWeightKNm: 0.02,
  };
  const missingMaterial = calculateMultiHang({
    ...structuredClone(example),
    beamSection: section,
  });
  assert.equal(missingMaterial.beamChecks.layers[0].strengthPass, null);
  assert.equal(missingMaterial.beamChecks.layers[0].deflectionPass, null);
  assert.match(missingMaterial.beamChecks.reason, /弹性模量 E/);
  assert.match(missingMaterial.beamChecks.reason, /受弯容许应力/);
  assert.match(missingMaterial.beamChecks.reason, /挠度限值/);
  assert.equal(missingMaterial.beamChecksAvailable, false);

  const missingWeight = calculateMultiHang({
    ...structuredClone(example),
    beamSection: { ...section, selfWeightKNm: undefined },
    beamElasticModulusNmm2: 200_000,
    beamAllowableBendingStressNmm2: 100,
    beamDeflectionLimitMm: 1,
  });
  assert.equal(missingWeight.beamChecks.layers[0].strengthPass, null);
  assert.equal(missingWeight.beamChecks.layers[0].deflectionPass, null);
  assert.match(missingWeight.beamChecks.reason, /型钢自重/);
  assert.equal(missingWeight.beamSelfWeightIncluded, false);
});
