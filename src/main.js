import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BEAM_PRESETS,
  cloneConfig,
  DEFAULT_CONFIG,
  getGeometryModel,
  HANGER_PRESETS,
  validateConfig,
} from './model.js';
import './styles.css';

const app = document.querySelector('#app');
let config = cloneConfig(DEFAULT_CONFIG);
let renderer;
let scene;
let camera;
let controls;
let supportGroup;
let resizeObserver;
let cameraFramed = false;

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="悬吊管道支架首页"><span class="brand-mark">支</span><span><strong>悬吊支架</strong><small>PIPE SUPPORT VISUALIZER</small></span></a>
    <div class="top-actions">
      <span class="demo-tag"><i></i>示例参数</span>
      <button class="button button-quiet" id="import-button">导入 JSON</button>
      <button class="button button-primary" id="export-button">导出配置</button>
      <input id="file-input" type="file" accept=".json,application/json" hidden />
    </div>
  </header>
  <main class="workspace">
    <aside class="panel settings-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">PARAMETERS</span><h1>支架配置</h1></div>
        <button class="icon-button" id="reset-button" title="恢复示例参数" aria-label="恢复示例参数">↺</button>
      </div>
      <p class="panel-intro">调整尺寸与层级，模型和工程示意图将同步更新。</p>

      <section class="form-section">
        <div class="section-title"><span class="section-index">01</span><h2>总体尺寸</h2></div>
        <label class="field-label" for="beam-width">支架宽度 <span>B</span></label>
        <div class="input-wrap"><input id="beam-width" type="number" min="200" max="6000" step="50"><span>mm</span></div>
        <p class="field-hint">两侧吊杆中心距</p>
      </section>

      <section class="form-section">
        <div class="section-title"><span class="section-index">02</span><h2>吊杆规格</h2></div>
        <label class="field-label" for="hanger-preset">截面类型</label>
        <select id="hanger-preset" class="select"><option value="preset">圆钢 · 标准规格</option><option value="custom">自定义直径</option></select>
        <label class="field-label sub-label" for="hanger-diameter">圆钢直径</label>
        <div class="input-wrap"><input id="hanger-diameter" type="number" min="8" max="60" step="1"><span>mm</span></div>
        <div class="preset-row" id="hanger-chips"></div>
      </section>

      <section class="form-section">
        <div class="section-title"><span class="section-index">03</span><h2>横梁规格</h2></div>
        <label class="field-label" for="beam-preset">角钢截面</label>
        <select id="beam-preset" class="select"></select>
        <div class="dimension-fields">
          <label><span>边长 L</span><div class="input-wrap"><input id="beam-leg" type="number" min="20" max="150" step="1"><span>mm</span></div></label>
          <label><span>厚度 t</span><div class="input-wrap"><input id="beam-thickness" type="number" min="2" max="16" step="1"><span>mm</span></div></label>
        </div>
      </section>

      <section class="form-section levels-section">
        <div class="section-title"><span class="section-index">04</span><h2>横梁标高</h2><span class="count-badge" id="level-count"></span></div>
        <div id="levels-list" class="levels-list"></div>
        <button class="add-level-button" id="add-level">＋ 添加一层</button>
      </section>

      <section class="form-section guide-section">
        <div class="section-title"><span class="section-index">05</span><h2>管线示意</h2></div>
        <div class="dimension-fields">
          <label><span>示意线数量</span><div class="input-wrap"><input id="guide-count" type="number" min="1" max="8" step="1"><span>条</span></div></label>
          <label><span>线间距</span><div class="input-wrap"><input id="guide-spacing" type="number" min="100" max="2000" step="50"><span>mm</span></div></label>
        </div>
        <p class="field-hint">仅作管线位置参考，不代表实体构件。</p>
      </section>
      <div id="validation" class="validation" role="alert" hidden></div>
      <div class="disclaimer"><span class="info-icon">i</span><p><strong>仅供可视化</strong><br>本工具不进行结构设计、承载力计算或规范校核。示例尺寸并非设计建议。</p></div>
    </aside>

    <section class="main-content">
      <div class="viewer-panel panel">
        <div class="viewer-heading">
          <div><span class="eyebrow">3D MODEL</span><h2>空间预览</h2></div>
          <div class="viewer-tools"><span class="drag-hint"><span>↗</span> 拖动旋转 · 滚轮缩放</span><button id="frame-button" class="button button-quiet small-button">重置视角</button></div>
        </div>
        <div id="viewport" class="viewport">
          <div class="model-caption"><span class="legend-dot steel"></span>角钢横梁 <span class="legend-dot rod"></span>圆钢吊杆 <span class="legend-dot guide"></span>管线示意</div>
          <div class="viewport-axis">X <span>·</span> Y <span>·</span> Z</div>
        </div>
        <div class="model-stats"><span><strong id="stat-width">—</strong><small>宽度 B</small></span><span><strong id="stat-levels">—</strong><small>横梁层数</small></span><span><strong id="stat-height">—</strong><small>总高（示意）</small></span><span class="section-stat"><strong id="stat-section">—</strong><small>角钢截面</small></span></div>
      </div>
      <div class="diagram-heading"><div><span class="eyebrow">DRAWINGS</span><h2>二维工程示意</h2></div><span class="diagram-note">尺寸单位：mm · 管线以虚线表示</span></div>
      <div class="diagram-grid">
        <section class="panel diagram-card"><div class="diagram-title"><span class="view-icon">▤</span><div><h3>正视图</h3><small>宽度与各层标高</small></div></div><div class="svg-holder" id="front-diagram"></div></section>
        <section class="panel diagram-card"><div class="diagram-title"><span class="view-icon">▥</span><div><h3>侧视图</h3><small>横梁与管线走向</small></div></div><div class="svg-holder" id="side-diagram"></div></section>
        <section class="panel diagram-card"><div class="diagram-title"><span class="view-icon">▦</span><div><h3>俯视图</h3><small>宽度与管线排布</small></div></div><div class="svg-holder" id="plan-diagram"></div></section>
      </div>
      <footer class="footer-note"><span>PARAMETRIC SUPPORT STUDY</span><span>仅供方案沟通参考 · 请由专业工程师复核</span></footer>
    </section>
  </main>
`;

const $ = (selector) => document.querySelector(selector);
const levelList = $('#levels-list');
const input = {
  beamWidth: $('#beam-width'),
  hangerDiameter: $('#hanger-diameter'),
  hangerPreset: $('#hanger-preset'),
  beamPreset: $('#beam-preset'),
  beamLeg: $('#beam-leg'),
  beamThickness: $('#beam-thickness'),
  guideCount: $('#guide-count'),
  guideSpacing: $('#guide-spacing'),
};

BEAM_PRESETS.forEach((preset) => {
  const option = document.createElement('option');
  option.value = `${preset.leg}x${preset.thickness}`;
  option.textContent = preset.label;
  $('#beam-preset').append(option);
});
$('#beam-preset').insertAdjacentHTML('beforeend', '<option value="custom">自定义截面</option>');

function readForm() {
  return {
    schemaVersion: 1,
    beamWidth: Number(input.beamWidth.value),
    hanger: { type: 'round-bar', diameter: Number(input.hangerDiameter.value) },
    beam: { type: 'angle', leg: Number(input.beamLeg.value), thickness: Number(input.beamThickness.value) },
    levels: [...levelList.querySelectorAll('input[data-level]')].map((field) => ({
      id: field.dataset.level,
      elevation: Number(field.value),
    })),
    guideLines: { count: Number(input.guideCount.value), spacing: Number(input.guideSpacing.value) },
  };
}

function syncForm(next) {
  input.beamWidth.value = next.beamWidth;
  input.hangerDiameter.value = next.hanger.diameter;
  input.hangerPreset.value = HANGER_PRESETS.includes(next.hanger.diameter) ? 'preset' : 'custom';
  input.beamLeg.value = next.beam.leg;
  input.beamThickness.value = next.beam.thickness;
  const beamPreset = BEAM_PRESETS.find(({ leg, thickness }) => leg === next.beam.leg && thickness === next.beam.thickness);
  input.beamPreset.value = beamPreset ? `${beamPreset.leg}x${beamPreset.thickness}` : 'custom';
  input.guideCount.value = next.guideLines.count;
  input.guideSpacing.value = next.guideLines.spacing;
  levelList.innerHTML = '';
  next.levels.forEach((level, index) => {
    const row = document.createElement('div');
    row.className = 'level-row';
    row.innerHTML = `<span class="level-marker">${String(index + 1).padStart(2, '0')}</span><label><span>第 ${index + 1} 层</span><div class="input-wrap"><input type="number" min="200" max="10000" step="50" value="${escapeHtml(level.elevation)}" data-level="${escapeHtml(level.id)}" aria-label="第 ${index + 1} 层标高"><span>mm</span></div></label><button class="remove-level" data-remove="${escapeHtml(level.id)}" aria-label="移除第 ${index + 1} 层" ${next.levels.length === 1 ? 'disabled' : ''}>×</button>`;
    levelList.append(row);
  });
  $('#level-count').textContent = `${next.levels.length} 层`;
  $('#hanger-chips').innerHTML = HANGER_PRESETS.map((size) => `<button class="preset-chip ${next.hanger.diameter === size ? 'active' : ''}" data-diameter="${size}">Ø${size}</button>`).join('');
  $('#hanger-chips').hidden = input.hangerPreset.value !== 'preset';
  $('#beam-leg').disabled = $('#beam-thickness').disabled = input.beamPreset.value !== 'custom';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function applyForm() {
  const candidate = readForm();
  const { valid, errors } = validateConfig(candidate);
  const validation = $('#validation');
  validation.hidden = valid;
  validation.innerHTML = valid ? '' : `<strong>请检查输入</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
  if (valid) {
    config = candidate;
    drawAll();
  }
  $('#level-count').textContent = `${candidate.levels.length} 层`;
  $('#hanger-chips').querySelectorAll('.preset-chip').forEach((chip) => chip.classList.toggle('active', Number(chip.dataset.diameter) === candidate.hanger.diameter));
  return valid;
}

function initScene() {
  const viewport = $('#viewport');
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#f8fafc');
  scene.fog = new THREE.Fog('#f8fafc', 15, 45);
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(6.8, 5.1, 7.6);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.prepend(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2;
  controls.maxDistance = 25;
  controls.target.set(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.1);
  key.position.set(5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbed9f5, 1.2);
  fill.position.set(-5, 3, -3);
  scene.add(fill);
  const grid = new THREE.GridHelper(12, 24, 0xcbd5e1, 0xe6ebf0);
  grid.position.y = -0.025;
  scene.add(grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);
  supportGroup = new THREE.Group();
  scene.add(supportGroup);
  resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(viewport);
  resizeRenderer();
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = $('#viewport');
  if (!clientWidth || !clientHeight || !renderer) return;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
  }
}

function makeAngleBeam(level, model) {
  const { leg, thickness } = config.beam;
  const shape = new THREE.Shape();
  const l = leg / 1000;
  const t = thickness / 1000;
  shape.moveTo(0, 0);
  shape.lineTo(l, 0);
  shape.lineTo(l, t);
  shape.lineTo(t, t);
  shape.lineTo(t, l);
  shape.lineTo(0, l);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: model.width / 1000, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(-l / 2, -l / 2, -model.width / 2000);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#8c9aa8', metalness: 0.68, roughness: 0.32 }));
  mesh.position.y = level.elevation / 1000;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  supportGroup.add(mesh);
}

function makeRod(x, model) {
  const radius = config.hanger.diameter / 2000;
  const start = model.rodStart / 1000;
  const end = model.rodEnd / 1000;
  const geometry = new THREE.CylinderGeometry(radius, radius, start - end, 16);
  const material = new THREE.MeshStandardMaterial({ color: '#34495e', metalness: 0.62, roughness: 0.34 });
  const rod = new THREE.Mesh(geometry, material);
  rod.position.set(x / 1000, (start + end) / 2, 0);
  rod.castShadow = true;
  supportGroup.add(rod);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 12, 8), material);
  cap.position.set(x / 1000, start, 0);
  supportGroup.add(cap);
}

function makeGuides(model) {
  const halfDepth = 1.8;
  const lineMaterial = new THREE.LineDashedMaterial({ color: '#3d8c8b', dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9 });
  model.levels.forEach((level) => model.guideLinePositions.forEach((z) => {
    const y = (level.elevation + 45) / 1000;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(z / 1000, y, -halfDepth),
      new THREE.Vector3(z / 1000, y, halfDepth),
    ]);
    const line = new THREE.Line(geometry, lineMaterial.clone());
    line.computeLineDistances();
    supportGroup.add(line);
  }));
}

function draw3d(resetView = false) {
  const model = getGeometryModel(config);
  clearGroup(supportGroup);
  model.hangerPositions.forEach((x) => makeRod(x, model));
  model.levels.forEach((level) => makeAngleBeam(level, model));
  makeGuides(model);
  const centerY = (model.rodStart + model.rodEnd) / 2000;
  const target = new THREE.Vector3(0, centerY, 0);
  const extent = Math.max(config.beamWidth / 1000, model.overallHeight / 1000);
  const fitDistance = extent * 1.85;
  if (!cameraFramed || resetView) {
    const direction = new THREE.Vector3(1.05, 0.8, 1.15).normalize();
    camera.position.copy(target).addScaledVector(direction, fitDistance);
    cameraFramed = true;
  } else {
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = Math.max(camera.position.distanceTo(controls.target), fitDistance);
    camera.position.copy(target).addScaledVector(direction, distance);
  }
  controls.target.copy(target);
  camera.near = 0.1;
  camera.far = Math.max(100, extent * 10);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(1, extent * 0.7);
  controls.maxDistance = Math.max(20, extent * 8);
}

function svgBase(viewName, content, label) {
  return `<svg viewBox="0 0 360 220" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="${viewName}-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0 0L7 3.5L0 7" fill="none" stroke="#8b9aa9" stroke-width="1"/></marker></defs>${content}</svg>`;
}

function drawFront() {
  const model = getGeometryModel(config);
  const levels = [...config.levels].sort((a, b) => a.elevation - b.elevation);
  const minH = Math.min(...levels.map((level) => level.elevation));
  const maxH = model.rodStart;
  const left = 86, right = 300, top = 28, bottom = 188;
  const y = (elevation) => bottom - ((elevation - minH + 200) / (maxH - minH + 400)) * (bottom - top);
  const beamX = (elevation) => {
    const yy = y(elevation);
    return `<path d="M${left} ${yy}h${right-left}v5H${left}z" fill="#82909e"/><path d="M${left} ${yy+5}h${right-left}v3H${left}z" fill="#a8b2bc"/>`;
  };
  const pieces = [
    `<line class="rod-svg" x1="${left}" y1="${y(maxH)}" x2="${left}" y2="${y(minH)}"/>`,
    `<line class="rod-svg" x1="${right}" y1="${y(maxH)}" x2="${right}" y2="${y(minH)}"/>`,
    ...levels.map((level) => `${beamX(level.elevation)}${model.guideLinePositions.map((x) => `<circle class="guide-point" cx="${(left+right)/2 + x / config.beamWidth * (right-left)}" cy="${y(level.elevation)+3}" r="2"/>`).join('')}`),
    ...levels.map((level) => `<text class="dim-label" x="${right+24}" y="${y(level.elevation)+3}">${level.elevation}</text>`),
    `<line class="dimension" x1="${left}" y1="204" x2="${right}" y2="204" marker-start="url(#front-arrow)" marker-end="url(#front-arrow)"/>`,
    `<text class="dim-label" x="${(left+right)/2}" y="218" text-anchor="middle">B = ${config.beamWidth}</text>`,
    `<line class="extension" x1="${left}" y1="190" x2="${left}" y2="207"/><line class="extension" x1="${right}" y1="190" x2="${right}" y2="207"/>`,
    `<text class="tiny-label" x="14" y="20">标高 H</text>`,
  ];
  $('#front-diagram').innerHTML = svgBase('front', pieces.join(''), '支架正视图，标注宽度 B 和各层标高');
}

function drawSide() {
  const model = getGeometryModel(config);
  const minH = Math.min(...config.levels.map((level) => level.elevation));
  const maxH = model.rodStart;
  const top = 28, bottom = 188;
  const y = (elevation) => bottom - ((elevation - minH + 200) / (maxH - minH + 400)) * (bottom - top);
  const left = 54, right = 314, center = 184;
  const pieces = [
    `<line class="rod-svg" x1="${center-8}" y1="${y(maxH)}" x2="${center-8}" y2="${y(minH)}"/><line class="rod-svg" x1="${center+8}" y1="${y(maxH)}" x2="${center+8}" y2="${y(minH)}"/>`,
    ...config.levels.map((level) => `<path d="M${center-34} ${y(level.elevation)}h68v6h-68z" fill="#82909e"/><line class="guide-svg" x1="${left}" y1="${y(level.elevation)+2}" x2="${right}" y2="${y(level.elevation)+2}"/>`),
    `<line class="dimension" x1="${left}" y1="202" x2="${right}" y2="202" marker-start="url(#side-arrow)" marker-end="url(#side-arrow)"/>`,
    `<text class="dim-label" x="${center}" y="218" text-anchor="middle">管线沿纵向 · 示意</text>`,
  ];
  $('#side-diagram').innerHTML = svgBase('side', pieces.join(''), '支架侧视图与示意管线走向');
}

function drawPlan() {
  const model = getGeometryModel(config);
  const left = 62, right = 298, centerY = 106;
  const zExtent = Math.max(1100, config.guideLines.spacing * config.guideLines.count * 0.65);
  const scale = Math.min((right - left) / config.beamWidth, 130 / (zExtent * 2));
  const beamLeft = 180 - model.width * scale / 2;
  const beamRight = 180 + model.width * scale / 2;
  const guideLines = model.guideLinePositions.map((x) => `<line class="guide-svg" x1="${180+x*scale}" y1="${centerY-65}" x2="${180+x*scale}" y2="${centerY+65}"/>`);
  const pieces = [
    `<rect x="${beamLeft}" y="${centerY-5}" width="${beamRight-beamLeft}" height="10" rx="2" fill="#82909e"/>`,
    ...guideLines,
    `<circle cx="${beamLeft}" cy="${centerY}" r="5" fill="#34495e"/><circle cx="${beamRight}" cy="${centerY}" r="5" fill="#34495e"/>`,
    `<line class="dimension" x1="${beamLeft}" y1="168" x2="${beamRight}" y2="168" marker-start="url(#plan-arrow)" marker-end="url(#plan-arrow)"/>`,
    `<line class="extension" x1="${beamLeft}" y1="118" x2="${beamLeft}" y2="173"/><line class="extension" x1="${beamRight}" y1="118" x2="${beamRight}" y2="173"/>`,
    `<text class="dim-label" x="180" y="187" text-anchor="middle">B = ${config.beamWidth}</text>`,
    `<text class="tiny-label" x="180" y="25" text-anchor="middle">管线示意 × ${config.guideLines.count}</text>`,
    `<text class="tiny-label" x="180" y="211" text-anchor="middle">● 吊杆位置　　━ 角钢横梁　　┄ 管线</text>`,
  ];
  $('#plan-diagram').innerHTML = svgBase('plan', pieces.join(''), '支架俯视图和示意管线排布');
}

function drawAll() {
  draw3d();
  drawFront();
  drawSide();
  drawPlan();
  $('#stat-width').textContent = `${config.beamWidth} mm`;
  $('#stat-levels').textContent = `${config.levels.length} 层`;
  $('#stat-height').textContent = `${getGeometryModel(config).overallHeight} mm`;
  $('#stat-section').textContent = `L${config.beam.leg}×${config.beam.thickness}`;
}

input.beamWidth.addEventListener('input', applyForm);
input.hangerDiameter.addEventListener('input', applyForm);
input.beamLeg.addEventListener('input', applyForm);
input.beamThickness.addEventListener('input', applyForm);
input.guideCount.addEventListener('input', applyForm);
input.guideSpacing.addEventListener('input', applyForm);
input.hangerPreset.addEventListener('change', () => {
  $('#hanger-chips').hidden = input.hangerPreset.value !== 'preset';
  if (input.hangerPreset.value === 'preset' && !HANGER_PRESETS.includes(Number(input.hangerDiameter.value))) {
    input.hangerDiameter.value = 20;
    applyForm();
  }
});
input.beamPreset.addEventListener('change', () => {
  const preset = BEAM_PRESETS.find(({ leg, thickness }) => `${leg}x${thickness}` === input.beamPreset.value);
  if (preset) {
    input.beamLeg.value = preset.leg;
    input.beamThickness.value = preset.thickness;
  }
  input.beamLeg.disabled = input.beamThickness.disabled = input.beamPreset.value !== 'custom';
  applyForm();
});
$('#hanger-chips').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-diameter]');
  if (!chip) return;
  input.hangerDiameter.value = chip.dataset.diameter;
  applyForm();
});
levelList.addEventListener('input', applyForm);
levelList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (!button || config.levels.length <= 1) return;
  config.levels = config.levels.filter(({ id }) => id !== button.dataset.remove);
  syncForm(config);
  applyForm();
});
$('#add-level').addEventListener('click', () => {
  if (config.levels.length >= 8) return;
  const lowest = Math.min(...config.levels.map(({ elevation }) => elevation));
  const elevation = Math.max(200, lowest - 600);
  if (config.levels.some((level) => level.elevation === elevation)) {
    $('#validation').hidden = false;
    $('#validation').textContent = '无法继续向下添加：标高已达到可用范围。';
    return;
  }
  config.levels.push({ id: `level-${crypto.randomUUID()}`, elevation });
  syncForm(config);
  applyForm();
});
$('#reset-button').addEventListener('click', () => {
  config = cloneConfig(DEFAULT_CONFIG);
  syncForm(config);
  $('#validation').hidden = true;
  applyForm();
});
$('#frame-button').addEventListener('click', () => draw3d(true));
$('#export-button').addEventListener('click', () => {
  if (!applyForm()) return;
  const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pipe-support-config.json';
  link.click();
  URL.revokeObjectURL(url);
});
$('#import-button').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    const { valid, errors } = validateConfig(imported);
    if (!valid) throw new Error(errors.join('\n'));
    config = imported;
    syncForm(config);
    $('#validation').hidden = true;
    applyForm();
  } catch (error) {
    $('#validation').hidden = false;
    $('#validation').innerHTML = `<strong>导入失败</strong><ul><li>${escapeHtml(error.message)}</li></ul>`;
  }
  event.target.value = '';
});

syncForm(config);
initScene();
drawAll();
