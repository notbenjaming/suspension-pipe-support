import {
  calculateMultiHang,
  LEGACY_KGF_TO_KN,
  pipeCatalogEntryToCalculationInput,
  ROD_DIAMETERS_MM,
  validateMultiHangInput,
} from './calculation.js';
import { PIPE_CATALOG } from './pipeCatalog.js';
import './styles.css';

const app = document.querySelector('#calculator-app');
const state = { layerCount: 3, result: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const pipeGroups = [...new Map(PIPE_CATALOG.pipes.map((pipe) => [
  pipe.code,
  { code: pipe.code, label: `${pipe.code} — ${pipe.line}` },
])).values()];

app.innerHTML = `
  <header class="calc-topbar">
    <a class="calc-brand" href="./" aria-label="返回悬吊支架可视化">
      <span class="brand-mark">支</span>
      <span><strong>悬吊支架</strong><small>PIPE SUPPORT CALCULATOR</small></span>
    </a>
    <div class="top-actions">
      <span class="standalone-tag"><i></i>独立计算模块</span>
      <a class="button button-quiet" href="./">返回三维可视化</a>
    </div>
  </header>
  <main class="calc-page">
    <section class="calc-title">
      <div><span class="eyebrow">LOAD & MEMBER CHECK · TAB 2</span><h1>多层吊架受力计算</h1><p>依据附件 Tab 2「多层吊架」公式提取，独立输入、独立计算，不与三维模型参数联动。</p></div>
      <span class="unit-contract">输入 / 输出：mm · kN</span>
    </section>
    <div class="calc-grid">
      <section class="calc-input panel">
        <div class="section-heading"><span class="section-index">01</span><div><h2>管道与层数</h2><p>选择类型和规格自动填入目录值；直径、排布宽度及换算后的 kN/m 均可手动修改。</p></div></div>
        <div class="layer-stepper"><span class="stepper-label">计算层数</span><button class="stepper-button" id="layer-minus" aria-label="减少层数">−</button><strong id="layer-count">3 层</strong><button class="stepper-button" id="layer-plus" aria-label="增加层数">＋</button><small>2–5 层</small></div>
        <div id="pipe-layers" class="pipe-layers"></div>
        <div class="catalog-note"><span class="info-icon">i</span><p><strong>目录及单位</strong>附件内置管道目录已提取到独立模块。目录重量以 kg/m 保存，选规格时按旧表系数 <code>kN/m = kg/m ÷ 100</code> 换算后填入；管径、线荷载、排布宽度均可按实际数据手动覆盖。</p></div>

        <div class="section-heading subsection"><span class="section-index">02</span><div><h2>吊架与吊杆参数</h2><p>所有力及线荷载输入均为 kN；所有几何尺寸均为 mm。</p></div></div>
        <div class="parameter-grid">
          <label class="parameter-field"><span>吊架间距</span><span class="input-unit"><input type="number" id="spacing" min="1" step="100" value="3000"><em>mm</em></span></label>
          <label class="parameter-field"><span>手工最小净宽</span><span class="input-unit"><input type="number" id="min-width" min="0" step="50" value="0"><em>mm</em></span></label>
          <label class="parameter-field"><span>横梁自重（手工）</span><span class="input-unit"><input type="number" id="beam-self-weight" min="0" step="0.01" value="0"><em>kN/m</em></span><small>缺少型钢库时不自动估算；默认 0 表示本次未计入。</small></label>
          <label class="parameter-field"><span>吊杆圆钢直径</span><span class="input-unit"><select id="rod-diameter"></select><em>mm</em></span></label>
          <label class="parameter-field"><span>吊杆钢号</span><span class="input-unit"><select id="rod-steel"><option value="Q235">Q235</option><option value="Q345">Q345</option></select></span></label>
        </div>

        <div class="section-heading subsection beam-section-heading"><span class="section-index">03</span><div><h2>横梁型钢校核</h2><p>横梁支持 C 槽钢 / H 型钢；强度和挠度校核需要型钢数据文件。</p></div></div>
        <div class="steel-library-warning" id="steel-library-status" role="status"><span class="warning-symbol">!</span><div><strong>未加载型钢库：横梁强度与挠度校核不可用</strong><p>请将 <code>steel_data.json</code> 放入 <code>public/steel_query_package/</code> 后刷新。不会使用臆造截面属性；吊架宽度、荷载、内力与吊杆验算仍可运行。</p></div></div>
        <div class="parameter-grid beam-input-grid">
          <label class="parameter-field"><span>横梁类型</span><span class="input-unit"><select id="beam-type" disabled><option>C 槽钢</option><option>H 型钢</option></select></span></label>
          <label class="parameter-field"><span>型钢型号</span><span class="input-unit"><select id="beam-model" disabled><option>等待型钢库</option></select></span></label>
        </div>
        <div class="engineering-note"><strong>工程边界</strong>本模块是计算过程原型，不是设计批准或规范符合性证明。结果需由专业工程师复核，且不应直接作为施工依据。</div>
        <div class="form-error" id="form-error" role="alert" hidden></div>
        <div class="calc-actions"><button class="button button-primary calculate-button" id="calculate">计算受力</button><button class="button button-quiet" id="reset">恢复示例输入</button></div>
      </section>

      <aside class="calc-results panel" aria-live="polite">
        <div class="result-heading"><span class="eyebrow">CALCULATION OUTPUT</span><h2>计算结果</h2><p id="result-state">填入各层管道荷载后开始计算。</p></div>
        <div class="result-body" id="result-body">
          <div class="empty-state"><span>∑</span><strong>等待计算</strong><p>计算结果将按层列出管道荷载、横梁内力、吊架宽度和吊杆验算。</p></div>
        </div>
        <div class="result-footnote"><span class="legend-dot warn"></span>横梁强度 / 挠度校核因型钢库缺失而禁用，不会显示为“满足”。</div>
      </aside>
    </div>
    <footer class="calc-footer"><span>TAB 2 · MULTI-LAYER HANGER</span><span>本页独立运行 · 与可视化模型参数暂不联动</span></footer>
  </main>
`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function specsForCode(code) {
  return PIPE_CATALOG.pipes.filter((pipe) => pipe.code === code);
}

function defaultPipe(code = 'HV', spec = 'DN100') {
  const pipe = specsForCode(code).find((item) => item.spec === spec) ?? PIPE_CATALOG.pipes[0];
  return pipe;
}

function makePipeRow(layerIndex, pipeIndex) {
  const selected = defaultPipe();
  const values = pipeCatalogEntryToCalculationInput(selected);
  const codeOptions = pipeGroups.map((group) =>
    `<option value="${escapeHtml(group.code)}" ${group.code === selected.code ? 'selected' : ''}>${escapeHtml(group.label)}</option>`).join('');
  const specOptions = specsForCode(selected.code).map((pipe) =>
    `<option value="${escapeHtml(pipe.spec)}" ${pipe.spec === selected.spec ? 'selected' : ''}>${escapeHtml(pipe.spec)}</option>`).join('');
  return `<div class="pipe-row" data-pipe-row>
    <span class="pipe-row-number">${pipeIndex + 1}</span>
    <label><span>管道类型</span><span class="input-unit"><select data-pipe="code" aria-label="第${layerIndex}层第${pipeIndex + 1}根管道类型">${codeOptions}</select></span></label>
    <label><span>规格</span><span class="input-unit"><select data-pipe="spec" aria-label="第${layerIndex}层第${pipeIndex + 1}根管道规格">${specOptions}</select></span></label>
    <label><span>管径 D</span><span class="input-unit"><input type="number" min="1" step="1" value="${values.diameterMm}" data-pipe="diameterMm" aria-label="第${layerIndex}层第${pipeIndex + 1}根管径"><em>mm</em></span></label>
    <label><span>管重换算 q</span><span class="input-unit"><input type="number" min="0" step="0.001" value="${values.lineLoadKNm}" data-pipe="lineLoadKNm" aria-label="第${layerIndex}层第${pipeIndex + 1}根线荷载"><em>kN/m</em></span></label>
    <label><span>排布宽度</span><span class="input-unit"><input type="number" min="1" step="10" value="${values.widthMm}" data-pipe="widthMm" aria-label="第${layerIndex}层第${pipeIndex + 1}根排布宽度"><em>mm</em></span></label>
    <button type="button" class="remove-pipe" data-remove-pipe aria-label="删除管道" ${pipeIndex === 0 ? 'disabled' : ''}>×</button>
  </div>`;
}

function renderLayers() {
  $('#layer-count').textContent = `${state.layerCount} 层`;
  $('#layer-minus').disabled = state.layerCount <= 2;
  $('#layer-plus').disabled = state.layerCount >= 5;
  $('#pipe-layers').innerHTML = Array.from({ length: state.layerCount }, (_, index) => `
    <section class="layer-card" data-layer="${index + 1}">
      <div class="layer-heading"><span class="layer-badge">${String(index + 1).padStart(2, '0')}</span><div><h3>第 ${index + 1} 层管道</h3><small>管道作用于本层横梁及总吊杆</small></div><button type="button" class="add-pipe" data-add-pipe>＋ 管道</button></div>
      <div class="pipe-rows">${makePipeRow(index + 1, 0)}</div>
      <div class="layer-extra"><label>本层附加线荷载 <span class="input-unit"><input type="number" min="0" step="0.1" value="0" data-extra-line><em>kN/m</em></span></label><label>本层附加集中力 <span class="input-unit"><input type="number" min="0" step="0.1" value="0" data-extra-point><em>kN</em></span></label></div>
    </section>`).join('');
  state.result = null;
  $('#result-body').innerHTML = '<div class="empty-state"><span>∑</span><strong>等待计算</strong><p>计算结果将按层列出管道荷载、横梁内力、吊架宽度和吊杆验算。</p></div>';
  $('#result-state').textContent = '填入各层管道荷载后开始计算。';
}

function readInput() {
  const layers = $$('.layer-card').map((card) => ({
    pipes: $$('.pipe-row', card).map((row) => ({
      diameterMm: Number($('[data-pipe="diameterMm"]', row).value),
      lineLoadKNm: Number($('[data-pipe="lineLoadKNm"]', row).value),
      widthMm: Number($('[data-pipe="widthMm"]', row).value),
    })),
  }));
  return {
    spacingMm: Number($('#spacing').value),
    minWidthMm: Number($('#min-width').value),
    beamSelfWeightKNm: Number($('#beam-self-weight').value),
    rodDiameterMm: Number($('#rod-diameter').value),
    rodSteel: $('#rod-steel').value,
    layers,
    extraLoads: $$('.layer-card').map((card) => ({
      lineKNm: Number($('[data-extra-line]', card).value),
      pointKN: Number($('[data-extra-point]', card).value),
    })),
  };
}

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function renderResults(result, input) {
  const widthComponents = result.layerWidthsMm.map((width, index) => `L${index + 1} ${format(width, 0)}`).join(' · ');
  const layers = result.layers.map((layer) => `
    <section class="result-layer">
      <div class="result-layer-heading"><span>第 ${layer.layer} 层</span><span class="layer-width">${format(layer.widthMm, 0)} mm</span></div>
      <div class="result-row"><span>管道线荷载 Σq</span><strong>${format(layer.pipeLineLoadKNm, 3)} <small>kN/m</small></strong></div>
      <div class="result-row"><span>管道集中荷载 Fv = Σq × 吊架间距</span><strong>${format(layer.pipePointLoadKN, 3)} <small>kN</small></strong></div>
      <div class="result-row"><span>横梁均布荷载 qv = Fv / 支架宽度</span><strong>${format(layer.distributedPipeLoadKNm, 3)} <small>kN/m</small></strong></div>
      ${layer.extraLineKNm ? `<div class="result-row"><span>附加线荷载</span><strong>${format(layer.extraLineKNm, 3)} <small>kN/m</small></strong></div>` : ''}
      ${layer.extraPointKN ? `<div class="result-row"><span>附加集中力</span><strong>${format(layer.extraPointKN, 3)} <small>kN</small></strong></div>` : ''}
      <div class="result-row"><span>弯矩 Mmax（包络 × 1.3）</span><strong>${format(layer.momentKNm, 3)} <small>kN·m</small></strong></div>
      <div class="result-row"><span>剪力 Vmax（包络 × 1.3）</span><strong>${format(layer.shearKN, 3)} <small>kN</small></strong></div>
    </section>`).join('');
  const beamSelfWeightText = input.beamSelfWeightKNm === 0
    ? '横梁自重按输入 0 计，本次未包含型钢自重。'
    : `横梁自重按手工输入 ${format(input.beamSelfWeightKNm, 3)} kN/m 计入。`;
  $('#result-state').textContent = '计算已完成；横梁截面强度和挠度因缺少型钢库仍不可用。';
  $('#result-body').innerHTML = `
    <section class="result-width"><span>计算吊架宽度 B</span><strong>${format(result.widthMm, 0)} <small>mm</small></strong><p>${widthComponents}${input.minWidthMm > 0 ? ` · 手工最小 ${format(input.minWidthMm, 0)} mm` : ''}</p></section>
    ${layers}
    <section class="result-layer rod-result">
      <div class="result-layer-heading"><span>总吊杆验算</span><span class="check-pill ${result.rodPass ? 'pass' : 'fail'}">${result.rodPass ? '满足本模块公式' : '不满足本模块公式'}</span></div>
      <div class="result-row"><span>总荷载（未乘系数）</span><strong>${format(result.totalRodLoadKN, 3)} <small>kN</small></strong></div>
      <div class="result-row"><span>总荷载 × 1.3</span><strong>${format(result.factoredTotalRodLoadKN, 3)} <small>kN</small></strong></div>
      <div class="result-row"><span>单根吊杆拉力（2 根均分）</span><strong>${format(result.loadPerRodKN, 3)} <small>kN</small></strong></div>
      <div class="result-row"><span>圆钢截面积 A = πd²/4</span><strong>${format(result.rodAreaMm2, 1)} <small>mm²</small></strong></div>
      <div class="result-row"><span>拉应力 σ = 1.5N/A</span><strong>${format(result.rodStressNmm2, 1)} <small>N/mm²</small></strong></div>
      <div class="result-row"><span>限值 0.85f (${escapeHtml(input.rodSteel)})</span><strong>${format(result.rodAllowableNmm2, 1)} <small>N/mm²</small></strong></div>
    </section>
    <div class="result-warning"><span class="warning-symbol">!</span><p>${escapeHtml(beamSelfWeightText)}横梁强度 / 挠度校核未执行；请补齐型钢库后再评估横梁。</p></div>`;
}

function runCalculation() {
  const input = readInput();
  const validation = validateMultiHangInput(input);
  const error = $('#form-error');
  error.hidden = validation.valid;
  error.innerHTML = validation.valid ? '' : `<strong>输入有误</strong><ul>${validation.errors.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`;
  if (!validation.valid) return;
  state.result = calculateMultiHang(input);
  renderResults(state.result, input);
}

function resetInputs() {
  state.layerCount = 3;
  $('#spacing').value = 3000;
  $('#min-width').value = 0;
  $('#beam-self-weight').value = 0;
  $('#rod-diameter').value = 16;
  $('#rod-steel').value = 'Q235';
  $('#form-error').hidden = true;
  renderLayers();
}

$('#rod-diameter').innerHTML = ROD_DIAMETERS_MM.map((diameter) => `<option value="${diameter}" ${diameter === 16 ? 'selected' : ''}>φ${diameter}</option>`).join('');
$('#layer-minus').addEventListener('click', () => {
  if (state.layerCount > 2) {
    state.layerCount -= 1;
    renderLayers();
  }
});
$('#layer-plus').addEventListener('click', () => {
  if (state.layerCount < 5) {
    state.layerCount += 1;
    renderLayers();
  }
});
$('#pipe-layers').addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-pipe]');
  const remove = event.target.closest('[data-remove-pipe]');
  if (add) {
    const rows = $('.pipe-rows', add.closest('.layer-card'));
    const rowCount = $$('.pipe-row', rows).length;
    if (rowCount >= 12) return;
    rows.insertAdjacentHTML('beforeend', makePipeRow(Number(add.closest('.layer-card').dataset.layer), rowCount));
  } else if (remove && !remove.disabled) {
    const rows = remove.closest('.pipe-rows');
    remove.closest('.pipe-row').remove();
    $$('.pipe-row', rows).forEach((row, index) => { $('.pipe-row-number', row).textContent = String(index + 1); });
  }
});
$('#pipe-layers').addEventListener('change', (event) => {
  const select = event.target.closest('select[data-pipe]');
  if (!select) return;
  const row = select.closest('.pipe-row');
  if (select.dataset.pipe === 'code') {
    const specs = specsForCode(select.value);
    $('[data-pipe="spec"]', row).innerHTML = specs.map((pipe) =>
      `<option value="${escapeHtml(pipe.spec)}">${escapeHtml(pipe.spec)}</option>`).join('');
  }
  if (select.dataset.pipe === 'code' || select.dataset.pipe === 'spec') {
    const selected = specsForCode($('[data-pipe="code"]', row).value)
      .find((pipe) => pipe.spec === $('[data-pipe="spec"]', row).value);
    if (!selected) return;
    const values = pipeCatalogEntryToCalculationInput(selected);
    $('[data-pipe="diameterMm"]', row).value = values.diameterMm;
    $('[data-pipe="lineLoadKNm"]', row).value = values.lineLoadKNm.toFixed(3);
    $('[data-pipe="widthMm"]', row).value = values.widthMm;
  }
});
$('#calculate').addEventListener('click', runCalculation);
$('#reset').addEventListener('click', resetInputs);

renderLayers();

fetch(`${import.meta.env.BASE_URL}steel_query_package/steel_data.json`)
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('响应内容不是 JSON，型钢库可能不存在');
    }
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data.data)) throw new Error('型钢库数据格式无效');
    $('#steel-library-status').classList.add('loaded');
    $('#steel-library-status').innerHTML = `<span class="warning-symbol">✓</span><div><strong>型钢库已加载；完整截面验算仍待模块接入</strong><p>库数据已识别，但当前版本仅展示 Tab2 的宽度、荷载、内力和吊杆结果；不会将未实现的横梁校核伪装为完成。</p></div>`;
  })
  .catch((error) => {
    $('#steel-library-status').dataset.reason = error.message;
    $('.steel-library-warning p', $('#steel-library-status')).textContent =
      `型钢库读取失败（${error.message}）。请将真实 steel_data.json 放入 public/steel_query_package/ 后刷新；不会估算或伪造截面属性。宽度、荷载、内力与吊杆验算仍可运行。`;
  });
