export const LEGACY_KGF_TO_KN = 0.01;
export const DEFAULT_STEEL_ALLOWABLE = { Q235: 215, Q345: 305 };
export const ROD_DIAMETERS_MM = [10, 12, 14, 16, 18, 20, 22];

const isPositiveFinite = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function legacyKgPerMToKNPerM(kgPerM) {
  return kgPerM * LEGACY_KGF_TO_KN;
}

export function pipeCatalogEntryToCalculationInput(pipe) {
  return {
    diameterMm: pipe.diameterMm,
    lineLoadKNm: legacyKgPerMToKNPerM(pipe.legacyWeightKgM),
    widthMm: pipe.widthMm,
  };
}

export function validateMultiHangInput(input) {
  const errors = [];
  const number = (value) => typeof value === 'number' && Number.isFinite(value);

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['输入必须是计算参数对象。'] };
  }
  if (!number(input.spacingMm) || input.spacingMm <= 0 || input.spacingMm > 30000) {
    errors.push('吊架间距应为大于 0 且不超过 30000 mm。');
  }
  if (!number(input.minWidthMm) || input.minWidthMm < 0 || input.minWidthMm > 30000) {
    errors.push('手工最小宽度应为 0–30000 mm。');
  }
  if (input.beamWidthOverrideMm !== undefined &&
      (!number(input.beamWidthOverrideMm) || input.beamWidthOverrideMm < 200 || input.beamWidthOverrideMm > 6000)) {
    errors.push('共享支架宽度应为 200–6000 mm。');
  }
  if (!Array.isArray(input.layers) || input.layers.length < 2 || input.layers.length > 5) {
    errors.push('多层吊架应设置 2–5 层。');
  } else {
    const hasPositivePipeLoad = input.layers.some((layer) =>
      layer && Array.isArray(layer.pipes) && layer.pipes.some((pipe) => pipe && number(pipe.lineLoadKNm) && pipe.lineLoadKNm > 0));
    if (!hasPositivePipeLoad) errors.push('请至少输入一项大于 0 的管道线荷载。');
    input.layers.forEach((layer, layerIndex) => {
      if (!layer || !Array.isArray(layer.pipes) || layer.pipes.length === 0) {
        errors.push(`第 ${layerIndex + 1} 层至少需要一根管道。`);
        return;
      }
      layer.pipes.forEach((pipe, pipeIndex) => {
        if (!number(pipe.diameterMm) || pipe.diameterMm <= 0 || pipe.diameterMm > 5000) {
          errors.push(`第 ${layerIndex + 1} 层第 ${pipeIndex + 1} 根管道直径应为 0–5000 mm。`);
        }
        if (!number(pipe.lineLoadKNm) || pipe.lineLoadKNm < 0 || pipe.lineLoadKNm > 10000) {
          errors.push(`第 ${layerIndex + 1} 层第 ${pipeIndex + 1} 根管道线荷载应为 0–10000 kN/m。`);
        }
        if (!number(pipe.widthMm) || pipe.widthMm <= 0 || pipe.widthMm > 10000) {
          errors.push(`第 ${layerIndex + 1} 层第 ${pipeIndex + 1} 根管道排布宽度应为 0–10000 mm。`);
        }
      });
      const extra = input.extraLoads?.[layerIndex];
      if (!extra || !number(extra.lineKNm) || extra.lineKNm < 0 || !number(extra.pointKN) || extra.pointKN < 0) {
        errors.push(`第 ${layerIndex + 1} 层附加荷载必须是非负 kN 值。`);
      }
    });
  }
  if (!number(input.beamSelfWeightKNm) || input.beamSelfWeightKNm < 0 || input.beamSelfWeightKNm > 100) {
    errors.push('横梁自重线荷载应为 0–100 kN/m。');
  }
  if (!number(input.rodDiameterMm) || input.rodDiameterMm < 6 || input.rodDiameterMm > 100) {
    errors.push('吊杆圆钢直径应为 6–100 mm。');
  }
  if (!Object.hasOwn(DEFAULT_STEEL_ALLOWABLE, input.rodSteel)) {
    errors.push('请选择 Q235 或 Q345 吊杆钢材。');
  }
  return { valid: errors.length === 0, errors };
}

function calculateLayerWidth(pipes) {
  const sumPipeWidthsMm = pipes.reduce((sum, pipe) => sum + pipe.widthMm, 0);
  const clearanceIncludedMm = sumPipeWidthsMm + (pipes.length + 1) * 50;
  return Math.ceil(clearanceIncludedMm / 100) * 100;
}

function calculateBeamInternalForces({ pipeLineLoadKNm, spacingM, spanM, extraLineKNm, extraPointKN, selfWeightKNm }) {
  const pipePointLoadKN = pipeLineLoadKNm * spacingM;
  const distributedPipeLoadKNm = pipePointLoadKN / spanM;
  const mDistributed = ((distributedPipeLoadKNm + extraLineKNm + selfWeightKNm) * spanM ** 2) / 8;
  const mPoint = ((pipePointLoadKN + extraPointKN + selfWeightKNm * spanM) * spanM) / 4;
  const vDistributed = ((distributedPipeLoadKNm + extraLineKNm + selfWeightKNm) * spanM) / 2;
  const vPoint = (pipePointLoadKN + extraPointKN + selfWeightKNm * spanM) / 2;
  return {
    pipePointLoadKN,
    distributedPipeLoadKNm,
    momentKNm: Math.max(mDistributed, mPoint) * 1.3,
    shearKN: Math.max(vDistributed, vPoint) * 1.3,
  };
}

function calculateBeamChecks(layers, spanM, section, input) {
  if (!section) return { available: false, reason: '未选择横梁型钢。' };

  const missing = [];
  if (!isPositiveFinite(section.IxMm4)) missing.push('截面惯性矩 Ix');
  if (!isPositiveFinite(section.WxMm3)) missing.push('截面抵抗矩 Wx');
  if (!isPositiveFinite(section.selfWeightKNm)) missing.push('型钢自重');
  if (!isPositiveFinite(input.beamElasticModulusNmm2)) missing.push('弹性模量 E');
  if (!isPositiveFinite(input.beamAllowableBendingStressNmm2)) missing.push('受弯容许应力');
  if (!isPositiveFinite(input.beamDeflectionLimitMm)) missing.push('挠度限值');

  const selfWeightAvailable = isPositiveFinite(section.selfWeightKNm);
  const strengthAvailable = isPositiveFinite(section.WxMm3) && selfWeightAvailable;
  const deflectionAvailable = isPositiveFinite(section.IxMm4) && selfWeightAvailable &&
    isPositiveFinite(input.beamElasticModulusNmm2);
  const strengthLimitAvailable = isPositiveFinite(input.beamAllowableBendingStressNmm2);
  const deflectionLimitAvailable = isPositiveFinite(input.beamDeflectionLimitMm);

  return {
    available: strengthAvailable && strengthLimitAvailable && deflectionAvailable && deflectionLimitAvailable,
    reason: missing.length ? `校核数据缺失：${missing.join('、')}。` : null,
    section: `${section.typeLabel ?? section.type ?? ''} ${section.model ?? ''}`.trim(),
    sectionWeightKNm: isPositiveFinite(section.selfWeightKNm) ? section.selfWeightKNm : null,
    layers: layers.map((layer) => {
      const bendingStressNmm2 = strengthAvailable
        ? layer.momentKNm * 1e6 / section.WxMm3
        : null;
      const strengthPass = strengthAvailable && strengthLimitAvailable
        ? bendingStressNmm2 <= input.beamAllowableBendingStressNmm2
        : null;

      let deflectionMm = null;
      if (deflectionAvailable) {
        const spanMm = spanM * 1000;
        const distributedLoadKNm = layer.distributedPipeLoadKNm +
          layer.extraLineKNm + layer.selfWeightKNm;
        const pointLoadKN = layer.pipePointLoadKN + layer.extraPointKN +
          layer.selfWeightKNm * spanM;
        const distributedDeflectionMm =
          5 * distributedLoadKNm * spanMm ** 4 /
          (384 * input.beamElasticModulusNmm2 * section.IxMm4);
        const pointDeflectionMm =
          pointLoadKN * 1000 * spanMm ** 3 /
          (48 * input.beamElasticModulusNmm2 * section.IxMm4);
        deflectionMm = Math.max(distributedDeflectionMm, pointDeflectionMm) * 1.3;
      }
      const deflectionPass = deflectionMm !== null && deflectionLimitAvailable
        ? deflectionMm <= input.beamDeflectionLimitMm
        : null;

      return {
        layer: layer.layer,
        bendingStressNmm2,
        allowableBendingStressNmm2: strengthLimitAvailable
          ? input.beamAllowableBendingStressNmm2
          : null,
        strengthPass,
        deflectionMm,
        deflectionLimitMm: deflectionLimitAvailable ? input.beamDeflectionLimitMm : null,
        deflectionPass,
      };
    }),
  };
}

export function calculateMultiHang(input) {
  const validation = validateMultiHangInput(input);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));

  const spacingM = input.spacingMm / 1000;
  const layerWidthsMm = input.layers.map(({ pipes }) => calculateLayerWidth(pipes));
  const widthMm = Math.max(...layerWidthsMm, input.minWidthMm, input.beamWidthOverrideMm ?? 0);
  const spanM = widthMm / 1000;
  const beamSection = input.beamSection ?? null;
  const sectionSelfWeightKNm = beamSection && isPositiveFinite(beamSection.selfWeightKNm)
    ? beamSection.selfWeightKNm
    : 0;
  const totalBeamSelfWeightKNm = input.beamSelfWeightKNm + sectionSelfWeightKNm;

  const layers = input.layers.map(({ pipes }, index) => {
    const pipeLineLoadKNm = pipes.reduce((sum, pipe) => sum + pipe.lineLoadKNm, 0);
    const extra = input.extraLoads[index];
    const internal = calculateBeamInternalForces({
      pipeLineLoadKNm,
      spacingM,
      spanM,
      extraLineKNm: extra.lineKNm,
      extraPointKN: extra.pointKN,
      selfWeightKNm: totalBeamSelfWeightKNm,
    });
    return {
      layer: index + 1,
      pipeCount: pipes.length,
      pipeLineLoadKNm,
      widthMm: layerWidthsMm[index],
      ...internal,
      extraLineKNm: extra.lineKNm,
      extraPointKN: extra.pointKN,
      selfWeightKNm: totalBeamSelfWeightKNm,
    };
  });

  const totalRodLoadKN = layers.reduce((sum, layer) =>
    sum + layer.pipePointLoadKN + layer.extraPointKN +
      (layer.distributedPipeLoadKNm + layer.extraLineKNm + layer.selfWeightKNm) * spanM, 0);
  const factoredTotalRodLoadKN = totalRodLoadKN * 1.3;
  const loadPerRodKN = factoredTotalRodLoadKN / 2;
  const rodAreaMm2 = Math.PI * input.rodDiameterMm ** 2 / 4;
  const rodStressNmm2 = 1.5 * loadPerRodKN * 1000 / rodAreaMm2;
  const rodAllowableNmm2 = DEFAULT_STEEL_ALLOWABLE[input.rodSteel] * 0.85;
  const beamChecks = calculateBeamChecks(layers, spanM, beamSection, input);

  return {
    widthMm,
    spanM,
    spacingM,
    layerWidthsMm,
    layers,
    totalRodLoadKN,
    factoredTotalRodLoadKN,
    loadPerRodKN,
    rodAreaMm2,
    rodStressNmm2,
    rodAllowableNmm2,
    rodPass: rodStressNmm2 <= rodAllowableNmm2,
    sectionSelfWeightKNm,
    beamSelfWeightIncluded: !beamSection || isPositiveFinite(beamSection.selfWeightKNm),
    beamChecks,
    beamChecksAvailable: beamChecks.available,
  };
}
