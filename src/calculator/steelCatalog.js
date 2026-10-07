export const STEEL_TYPES = Object.freeze({
  C: 'C 槽钢',
  H: 'H 型钢',
});

export const STEEL_KG_M_TO_KN_M = 9.80665 / 1000;

function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseSteelCatalog(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    throw new Error('型钢库格式无效：缺少 data 数组。');
  }
  if (Number.isInteger(payload.metadata?.total_records) &&
      payload.metadata.total_records !== payload.data.length) {
    throw new Error('型钢库记录数与 metadata.total_records 不一致。');
  }

  const sections = [];
  const unavailable = [];
  for (const record of payload.data) {
    if (!record || !Object.hasOwn(STEEL_TYPES, record.type)) continue;
    const missing = [];
    if (typeof record.model !== 'string' || !record.model.trim()) missing.push('model');
    for (const key of ['Ix', 'Wx', 'weight']) {
      if (!isPositiveFinite(record[key])) missing.push(key);
    }
    if (missing.length) {
      unavailable.push({
        type: record.type,
        model: typeof record.model === 'string' ? record.model : '未知型号',
        missing,
      });
      continue;
    }
    sections.push({
      type: record.type,
      typeLabel: STEEL_TYPES[record.type],
      model: record.model,
      IxCm4: record.Ix,
      WxCm3: record.Wx,
      weightKgPerM: record.weight,
      IxMm4: record.Ix * 10000,
      WxMm3: record.Wx * 1000,
      selfWeightKNm: record.weight * STEEL_KG_M_TO_KN_M,
    });
  }
  if (!sections.length) {
    throw new Error('型钢库中没有可用于横梁校核的 C 槽钢或 H 型钢截面。');
  }
  return { sections, unavailable, recordCount: payload.data.length };
}
