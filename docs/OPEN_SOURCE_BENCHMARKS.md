# 开源项目深度对标：HyHub 燃料电池电堆工作台

> 对标日期：2026-10-19。本文记录可验证的上游项目、可迁移的产品模式及本项目的实现边界。对标不等于复制代码或数据。

## 1. 上游项目与可借鉴点

### ECSIM/OPEM — PEMFC 模型工作流
- 仓库：[ECSIM/opem](https://github.com/ECSIM/opem)
- 关键实现：[Amphlett 模型](https://github.com/ECSIM/opem/blob/master/opem/Static/Amphlett.py)、[模型测试](https://github.com/ECSIM/opem/blob/master/test/test_Amphlett.py)、[通用函数](https://github.com/ECSIM/opem/blob/master/opem/Functions.py)。
- 借鉴：将工况输入（温度、氢/氧分压、电流、电极有效面积、膜厚等）、模型中间量和最终输出分层；保留标准测试向量；展示极化/功率/热功率等彼此关联的结果；对无效工况明确报错或标记状态。
- 不照搬：OPEM 中的特定公式、经验系数或默认输入不能自动视为本项目模型的权威参数。任何模型合并都必须先核对适用温度、压力、几何尺寸、单位和假设。

### 工程仪表盘与可观测性模式
- 参考 OPEM 对输入、输出和计算状态的组织方式，而非只追求图表数量。
- 借鉴：每个 KPI 明确单位、工况、模型来源和是否为实测；异常/功率受限/净功率不足应作为状态，而不是用正常色值掩盖。

## 2. 对本项目的产品映射

| 工作区 | 目标模式 | 验收点 |
|---|---|---|
| 电堆工作台 | 工况输入 + 状态摘要 + 核心输出 | 参数改变后主要结果同步更新；状态限制可见 |
| 动态仿真 | 时间轴、可调变量、暂停/继续、重置 | 动画与数值来自同一模型状态 |
| 工程计算 | 公式/单位/输入校验/结果 | 单位和边界条件完整，不把估算写成实测 |
| 参数库 | 按电化学、热管理、辅机等分组 | 参数有单位、范围、来源/备注 |
| 监控 | 实测与模拟分层 | 缺少设备接入时明确显示演示/模拟模式 |
| 数据对比 | 同条件方案对比 | 比较基准、版本和工况一致 |

## 3. 本轮实际落地
- 工作台新增“工况设定 → 动态仿真 → 工程计算 → 运行监控”快捷路径，避免用户只看到孤立 KPI。
- 继续维持模型提示：目标功率未达到、扫描下限、净功率不足等工况需显著说明。
- 保留 V3 样式作为原始设计基础，新增 V4/V5 样式层以低风险增强响应式和交互。

## 4. 后续重构要求
1. 建立模型来源登记：文献/项目/版本/适用范围/参数单位/验证向量。
2. 为每一种模型增加基准工况测试，而不是仅测函数存在。
3. 实测数据必须包含时间戳、单位、数据源和设备状态；无实测接入时不可标“实时监控”。
4. 对比 OPEM 或其他模型时先验证方程、边界、参数与单位，禁止直接拼接不同模型的输出。

## 5. 参考链接
- [OPEM README 与模型说明](https://github.com/ECSIM/opem)
- [Amphlett 模型源文件](https://github.com/ECSIM/opem/blob/master/opem/Static/Amphlett.py)
- [Amphlett 回归测试](https://github.com/ECSIM/opem/blob/master/test/test_Amphlett.py)


## 6. 2026-10-22 实施补充：制造商公开规格库与口径核验

- 首页公开规格库目前仅保留 5 条可追溯的制造商产品记录：Toyota Mirai TFCS、Hyundai NEXO (2018)、Hyundai All-New NEXO、Ballard FCmove-HD+、REFIRE PRISMA XII+。
- 字段来源：Toyota 2023 Mirai 官方 eBrochure；Hyundai 2018 NEXO 技术规格；Hyundai 2025 All-New NEXO 官方新闻稿；Ballard FCmove 官方产品规格页；REFIRE PRISMA XII+ 官方产品资料。每条记录直接链接到原厂资料。
- 现有数据按产品边界分别标记为车辆燃料电池系统、燃料电池堆、重型车辆模块或完整燃料电池系统。gross stack output、net system output、rated module power 和 rated system power 不合并排名。
- 仅在原厂资料明确披露时填入单电池数、体积功率密度、重量功率密度、模块质量或系统寿命。未披露字段保留为空，不通过额定功率和外形尺寸反推，也不填入第三方估算。
- 这些记录是制造商发布的规格，不等于本项目台架实测、独立第三方验证、寿命实测或设计输入。模型标定仍需单独的测试报告、工况、单位、测量不确定度和复现数据。
- 已更新 `scripts/validate-global-database.cjs` 与浏览器验收，校验 5 条数据、来源 URL、gross/net 口径、模块/系统边界及关键字段，不允许恢复旧版无出处的“全球领先”或虚构同步统计。

## 7. 扩展开源对标：模型计算与多尺度验证

> 覆盖说明：GitHub 上同类仓库数量持续变化，无法宣称穷尽所有仓库。本节按 PEMFC 直接相关性选取可核查的代表项目；历史版本仅作方法参考，不作为当前依赖。

| 上游项目 | 可核查入口 | 对 HyHub 的具体借鉴 | 不直接照搬的部分 |
|---|---|---|---|
| [ECSIM/OPEM](https://github.com/ECSIM/opem) | [Amphlett 模型](https://github.com/ECSIM/opem/blob/master/opem/Static/Amphlett.py)、[模型测试](https://github.com/ECSIM/opem/blob/master/test/test_Amphlett.py) | 输入单位、标准工况向量、性能输出和模型回归测试 | 不将 OPEM 经验参数直接替换当前模型；温度、压力、膜厚、有效面积必须统一单位与假设 |
| [OpenFCST v0.3](https://github.com/OpenFCST/OpenFCSTv03) | [项目与模块说明](https://github.com/OpenFCST/OpenFCSTv03)、[官方版本下载与文档](https://openfcst.org/downloads/) | PEMFC 分层（阳极、阴极、MEA）、材料与物理方程模块化、有限元多物理场建模思路 | v0.3 是历史版本/旧代码线，不能描述为持续维护的现代 Web 框架；只参考模型分层和文献验证方式 |

### 对本项目的实现映射
- 模型来源注册：为每个计算模块补齐模型名称、方程版本、单位制、适用范围、假设和参考文献；与厂家产品数据库分开管理。
- 模型结果卡：输入工况、模型版本、输出量/单位、限制状态和是否实测同屏展示；不得将模拟输出显示为台架实测。
- 基准向量：从公开模型及论文中选取明确工况，记录原始单位、换算过程、参考输出和容差。
- 多尺度路线：系统级电堆模型、部件级物理模型和实测标定分层，不将不同模型预测拼成一个“高精度”结果。

本轮用户可见落地：HyHub 首页已增加“模型分析—工况仿真—工程计算—运行监控”四步入口；下一阶段需把各模块输入/输出面板和模型证据登记做成可交互的数据表。
