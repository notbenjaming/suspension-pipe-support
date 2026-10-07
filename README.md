# 悬吊管道支架可视化

独立的浏览器端参数化示意工具，用于展示多层悬吊式钢管支架的三维外观和正视、侧视、俯视示意。项目仅使用 Vite、JavaScript 和 Three.js，不连接 SAP2000 或其他分析软件。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```sh
npm install
npm run dev
```

## 构建与测试

```sh
npm test
npm run build
npm run preview
```

## 配置功能

- 编辑支架宽度 B、横梁层数及各层标高。
- 吊杆使用圆钢，可选择 Ø12、Ø16、Ø20、Ø24、Ø30 标准尺寸或自定义直径。
- 横梁使用真实 L 形角钢截面，可选择 L40×4、L50×5、L63×6 或自定义边长与厚度。
- 三维视图支持旋转和缩放。管线仅以示意线显示，不构造实体管道。
- 配置可导出为 JSON，也可导入并即时验证。重置按钮恢复标注为示例的初始配置。

输入范围：宽度 200–6000 mm；圆钢直径 8–60 mm；角钢边长 20–150 mm、厚度 2–16 mm；标高 200–10000 mm；横梁层间距至少 100 mm。

## 多层吊架受力计算（独立页面）

运行开发服务器后打开 `/suspension-pipe-support/calculator.html`；生产部署下页面路径为 `/suspension-pipe-support/calculator.html`。它从附件 `pipe_support.html` 中仅提取 Tab 2「多层吊架」所需的宽度、管道荷载、横梁内力和总吊杆公式，计算代码封装在 `src/calculator/` 的 ES modules 中，不向 `window` 添加变量，也不修改可视化入口 `src/main.js`。此阶段是独立计算页，不与可视化配置同步。

计算输入和计算模块内部约定使用 mm、kN、kN/m；间距以 mm 输入后显式换算为 m，线荷载与力矩统一分别以 kN/m、kN·m 计算。Tab2 所需的 124 条管道目录记录从附件内嵌 `__PIPE_DATA__.pipes` 提取到 `src/calculator/pipeCatalog.js`，不包括其他计算 tab 的管道类型。按管道类型和规格选择时，直径、宽度与线荷载会自动填入，三项仍可手工覆盖；切换规格时会重新载入该规格目录值。附件旧表管重单位为 kg/m，旧 Excel 采用 `kN/m = kg/m ÷ 100` 的近似转换，界面会显示并应用该显式换算。不要将该历史近似当作精确的 SI 重力换算。

当前工作区没有型钢数据文件 `public/steel_query_package/steel_data.json`。页面会尝试加载它；缺少数据时明确禁用横梁截面校核。现阶段宽度、各层荷载与内力、按手工横梁自重输入的总吊杆验算可独立计算；型钢强度和挠度不返回虚假的“满足”结论。收到真实型钢库后，才可继续接入 C 槽钢 / H 型钢截面校核。

## GitHub Pages 部署

仓库已包含 `.github/workflows/deploy.yml`。工作流在 `main` 分支更新后执行测试、构建并部署 Pages，Vite 的静态资源基路径设置为 `/suspension-pipe-support/`。首次部署前，在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。

## 使用边界

此项目是概念可视化，不是结构设计或验证工具。它不检查材料强度、稳定性、连接、挠度、荷载、规范符合性，也不应作为施工依据。初始参数仅为界面演示示例，不构成推荐或规定尺寸。实际工程应由具备资质的专业人员独立设计和复核。
