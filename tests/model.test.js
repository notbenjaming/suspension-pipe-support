import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneConfig, DEFAULT_CONFIG, getGeometryModel, validateConfig } from '../src/model.js';

test('example configuration is valid and geometry has paired hangers and one member per level', () => {
  assert.equal(validateConfig(DEFAULT_CONFIG).valid, true);
  const model = getGeometryModel(DEFAULT_CONFIG);
  assert.deepEqual(model.hangerPositions, [-600, 600]);
  assert.equal(model.levels.length, 3);
  assert.equal(model.guideLinePositions.length, 3);
  assert.equal(model.rodStart, 2850);
  assert.equal(model.rodEnd, 1200);
});

test('validator reports out-of-range dimensions, invalid sections, and duplicate levels', () => {
  const invalid = cloneConfig(DEFAULT_CONFIG);
  invalid.beamWidth = 99;
  invalid.beam.thickness = 30;
  invalid.levels[1].elevation = invalid.levels[0].elevation;
  const result = validateConfig(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /宽度/);
  assert.match(result.errors.join(' '), /角钢/);
  assert.match(result.errors.join(' '), /重复/);
});

test('custom valid dimensions produce guide lines centered on the support', () => {
  const custom = cloneConfig(DEFAULT_CONFIG);
  custom.beamWidth = 1750;
  custom.guideLines = { count: 4, spacing: 500 };
  const model = getGeometryModel(custom);
  assert.deepEqual(model.hangerPositions, [-875, 875]);
  assert.deepEqual(model.guideLinePositions, [-750, -250, 250, 750]);
  assert.equal(model.overallHeight, 2850);
});
