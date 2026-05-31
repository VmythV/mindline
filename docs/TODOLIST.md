# 思谱 Mindline · 开发 TODOLIST

> 依据 `思谱-需求文档.md`（PRD + 技术架构 v0.1）与 `detail/` 下 6 份详设生成。
> 范围：全量 M0–M6（M0–M2 任务级，M3–M6 中粒度）+ 阶段0 启动准备。

| 项 | 内容 |
|----|------|
| 版本 | v0.1 |
| 生成日期 | 2026-05-30 |
| MVP 范围 | M0–M2（协同思维导图 + AI 拆解 + 时间轴/里程碑 的最小价值闭环） |
| 技术栈 | React+TS+Vite / NestJS / Hocuspocus+Yjs / Postgres+Redis+MinIO / 多模型 AI 网关 |

**图例**：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · 📄 文档出处 · ⚠️ 需先拍板的风险点 · 🔗 依赖

---

## ⭐ 开工前待你拍板清单（汇总）

> 这些决策会影响下方任务的实现方式，建议在进入对应里程碑前确认。详见各条出处。

- [ ] **D1 · ChangeEvent 落库可靠性** ⚠️：现方案"发起方客户端异步落库、远端不重复派生"，发起方掉线/失败可能丢事件。是否在 M0 加服务端兜底（onStoreDocument/update 流补偿 或 落库重试队列）？ 📄 Yjs §4.3 / §10
- [x] **D2 · path_ids 维护策略**：✅ 已定「记录事件发生时的祖先链」（落库冗余、不随移动回改；branch 过滤走 ix_changes_path GIN）。 📄 数据模型 §7、API §12
- [x] **D3 · ID 生成**：✅ ULID + 前缀，应用层 `newId()` 生成，不做 DB 兜底。 📄 数据模型 §7
- [ ] **D4 · 配置加密方案**：`ai_provider_configs.config`、`im_channels.config` 含密钥，KMS/对称密钥选型。 📄 数据模型 §7
- [ ] **D5 · 是否先做 M0a Walking Skeleton**：单租户最小端到端链路先打通再铺开（强烈建议）。
- [x] **D6 · monorepo 工具确认**：✅ 已采用 pnpm workspace + Turborepo。
- [x] **D7 · DB 迁移工具选型**：✅ 已选 Drizzle ORM + drizzle-kit。
- [x] **D8 · AI 网关形态**：✅ 已定「自研薄适配层」（OpenAI 兼容；最小闭环 env 单网关 + stub 降级）。 📄 主文档 §5.2 / AI §1

---

## 阶段0 · 项目启动准备

### 0.1 工程脚手架
- [x] 初始化 monorepo：`apps/web`(前端) `apps/api`(NestJS) `apps/collab`(Hocuspocus) `packages/shared`(共享类型/契约) 🔗 D6
- [x] TypeScript 基础配置（tsconfig base、路径别名、严格模式）
- [x] ESLint + Prettier 统一规范
- [ ] **自定义 ESLint 规则 + CI 静态检查：禁止业务层直接 import yjs 写类型（强制走命令层）** ⚠️ 📄 Yjs §11
- [ ] 测试框架（Vitest）+ 提交规范（husky/lint-staged，可选）

### 0.2 本地基础设施
- [x] Docker Compose：Postgres 14+ / Redis / MinIO（+ 可选 AI 网关）一键拉起 📄 主文档 §5.2
- [ ] 环境变量管理与校验（.env schema）
- [ ] DB 迁移工具接入 + 执行 DDL 📄 数据模型 §3、建表顺序 §5 🔗 D7

### 0.3 CI/CD
- [ ] CI 流水线：lint + typecheck + test + build + 命令层绕过拦截检查
- [ ] 镜像构建（web/api/collab 各一）
- [ ] 部署骨架（Compose 优先；K8s Helm 可后置到 M5，SaaS 与私有同套）

### 0.4 共享契约（packages/shared）
- [x] TS 类型：Node / ChangeEvent / Proposal / 错误码枚举 / ID 前缀规范 📄 API §1.4/§1.6/§11
- [ ] 命令层接口契约：Command 类型、ChangeEvent.op 枚举 📄 Yjs §4.1
- [x] 统一错误模型与 HTTP/WS 错误码 📄 API §1.3/§1.4

---

## M0 · 地基

> 交付：账号/租户/项目/成员角色 · Schema 类型系统 · Yjs+Hocuspocus 协同跑通 · 2D 树编辑 · 命令层+ChangeEvent 落库
> 验收：两人实时编辑同一树不丢操作（<500ms）；删子树 Cmd+Z 完整恢复；变更入库；1000 节点 ≥30FPS

### M0a · Walking Skeleton（建议先行）🔗 D5
- [ ] 单租户最小登录（JWT 签发/校验）
- [ ] 建一个 project + 关联 map（1:1）
- [ ] 前端 React Flow 渲染一棵静态树
- [ ] Hocuspocus 连接，两端同步一个节点变更
- [ ] 一条 ChangeEvent 成功落 `change_events`

### M0.1 数据层
- [x] 执行核心 DDL（按依赖顺序）：tenants/users/workspaces/projects/maps/project_members/node_type_schemas(+versions)/yjs_updates/yjs_snapshots/change_events 📄 数据模型 §3、§5
- [ ] 多租户隔离：应用层强制 `tenant_id` scope（中间件/ORM 全局 scope）+ 可选 RLS 📄 数据模型 §6

### M0.2 认证与租户
- [x] `POST /auth/register`、`POST /auth/login`、`POST /auth/refresh`、`GET /me` 📄 API §3
- [x] JWT 含 sub/tenantId/type(access·refresh)/exp；刷新令牌机制（bcryptjs 哈希；users 加 password_hash）
- [x] 全局 JwtGuard + `@Public()`；统一错误体过滤器；ValidationPipe；tenantId 从 JWT 注入（不接受 body 覆盖） 📄 API §1.2
- [ ] 租户上下文中间件 + 应用层 `tenant_id` scope 强制（M0.3 起逐查询落实）

### M0.3 项目与成员
- [x] 项目 CRUD `/projects`（含 parentId 父子嵌套）📄 API §4
- [x] 成员管理 `/projects/:id/members`；角色枚举 owner/admin/editor/commenter/viewer（声明式 @MinRole + ProjectRoleGuard）
- [x] 创建项目时自动建 map（1:1，project.mapId 由 join 得到）📄 数据模型 §3.2

### M0.4 节点类型 Schema 系统
- [x] `GET/POST /projects/:id/node-types`；definition 结构校验（typeKey 规范、规范化合并） 📄 API §5、主文档 §3.3
- [x] 字段类型支持：text/richtext/number/date/datetime/enum/multiEnum/user/link/checkbox/tags（FieldType 已定义于 @mindline/shared）
- [x] 内置开箱模板：idea/task/objective/keyResult/knowledge/requirement/bug（注册租户自动 seed） 📄 主文档 附录A
- [x] 节点详情面板：按 Schema 动态渲染表单（enum→下拉、date→日期、richtext→协同编辑器、user→人员选择…）

### M0.5 Yjs 协同内核（apps/collab）
- [x] Y.Doc 结构：nodes 扁平 Map（parentId+order+title+data…）+ meta（title 暂 string，Y.Text 后续）📄 Yjs §2
- [x] 分数索引排序（fractional-indexing；同位冲突以 nodeId 二级兜底）📄 Yjs §3
- [x] `onAuthenticate`：JWT + 项目成员资格 + map 读/写权（e2e 验证）📄 Yjs §7
- [x] `onLoadDocument`：最近快照重建（增量 update 优化后续）
- [x] `onStoreDocument`：防抖落 `yjs_snapshots`（snapshot-only；增量 + 压实后续）
- [ ] Redis pub/sub 多实例广播；WS 关闭码 4401/4403/4404/1011
- [x] 前端 children 派生索引（监听 nodes 增量更新，不双写 children）📄 Yjs §2

### M0.6 命令层（packages/shared + web）
- [x] `MapRepository` 封装唯一写入口（对外仅暴露命令 API）📄 Yjs §11
- [x] 命令：CreateNode/RenameNode/DeleteSubtree/MoveNode/SetField（setOwner/setType 待补）📄 Yjs §4.1
- [x] 每条命令：单 `transact`（带 origin）改文档 + 显式产出 ChangeEvent
- [x] 批量命令共享 batchId（删子树）
- [x] ChangeEvent 落库 `POST /maps/:mapId/changes`（发起方已实现；服务端兜底 D1 待补）⚠️ 🔗 D1 📄 API §6

### M0.7 2D 树编辑（web · React Flow）
- [x] 自定义节点渲染 + 自动布局（简单层级树；左右展开/径向/手动微调待完善）
- [ ] 视口虚拟化（仅渲染可视区 + 缓冲区）
- [ ] 快捷键：Tab/Enter/Shift+Enter/Delete/方向键/Cmd+.（折叠）📄 主文档 附录B
- [x] 拖拽改父（就近改父，禁止移入自身子树；改排序待细化）
- [x] 轻富文本节点正文（Tiptap，节点详情侧栏 B/I/列表/代码块；字符级协同 y-prosemirror 后续）📄 主文档 A3

### M0.8 撤销重做（A9）
- [x] `Y.UndoManager`（trackedOrigins=本地 origin，captureTimeout=500，仅撤自己）📄 Yjs §5
- [ ] 撤销/重做产出补偿 ChangeEvent；复合命令用 `stopCapturing()` 封为单 undo 单元

---

## M1 · 协同与历史

> 交付：Awareness 在线协作 · 节点历史+项目时间轴 · 预览/右键/命令面板 · 自定义字段表单
> 验收：字段级历史可查；时间轴可过滤；一次 AI 拆解折叠为 1 条批量事件

### M1.1 Awareness 在线协作
- [x] 广播临时状态 user/cursor(nodeId+field+selection)/editingNodeId 📄 Yjs §6
- [x] 渲染他人光标/选区彩色 + 「正在编辑」徽标 + 在线头像列表
- [x] 断线心跳超时自动清除

### M1.2 变更历史与时间轴
- [x] `GET /maps/:mapId/changes`（actor/op/field/batchId/branch/from/to/cursor/limit）📄 API §6
- [x] `GET /nodes/:nodeId/history`（单节点字段级历史）
- [x] `GET /maps/:mapId/snapshot`（只读快照，导出/3D/搜索/AI 上下文用）
- [x] 项目级时间轴 UI：横向流，同 batchId 折叠为批量事件（可展开）
- [x] 节点历史侧栏（倒序字段级 diff：谁/何时/A→B）
- [x] 过滤：人 / 操作类型 / 分支(子树) / 时间范围
- [x] path_ids 落库 + branch 过滤实现 🔗 D2 📄 数据模型 §4

### M1.3 交互体系
- [x] 快捷键完整清单 📄 主文档 附录B
- [x] 右键上下文菜单 📄 主文档 附录C
- [x] `Space` 节点预览卡片（只读速览）
- [x] `Cmd+K` 命令面板（模糊搜索并执行主要命令）
- [x] `Cmd+F` 搜索节点

### M1.4 自定义字段表单完善
- [x] `PUT /node-types/:id`：升 version；破坏性变更（删/改字段）提示建议生成迁移 📄 API §5
- [x] 切换节点类型按 A10 处理旧字段（保留旧值 + 标记废弃）📄 主文档 §3.3

---

## M2 · AI 首发

> 交付：模型网关 + 生成子树 + diff 预览 · 人工里程碑 + AI 辅助建议/摘要
> 验收：拆解结果经预览方写入（未确认不入文档/不参与协同）；里程碑可标记；AI 摘要为可编辑初稿
>
> 🔶 **已交付「AI 拆解最小闭环」**（M2.1 部分 / M2.2 / M2.3 / M2.4）：自研薄适配层（env 单网关 + stub 降级）、Context Builder、`decompose` SSE、虚影 diff 预览 → 确认写回。完整版（多租户凭证/计量表/能力探测/depth>1/summarize/里程碑）留后续。

### M2.1 AI 模型网关
- [~] 多模型适配（OpenAI 兼容协议优先；**最小闭环：自研薄适配层 + env 单网关**）🔗 D8 📄 AI §1
- [ ] 启动探测每模型能力 `{stream, functionCall, jsonMode}` 📄 AI §11
- [ ] 凭证路由：平台默认额度 / 租户自带 Key（按租户）📄 AI §8、主文档 A6
- [ ] `ai_provider_configs` / `ai_usage` 表 + tokens in/out 计量 📄 数据模型 §3.8
- [x] 错误与降级：functionCall→jsonMode（换模型提示后续）

### M2.2 上下文组装 + 提示词
- [x] Context Builder：target/ancestors/siblings/children/targetSchema/userPrompt（从只读快照）📄 AI §2
- [x] token 预算裁剪策略（优先级 + 兄弟/父链截断）📄 AI §2.2
- [x] system+user 模板 + `emit_subtree` 函数定义 📄 AI §3

### M2.3 生成子树 decompose（SSE）
- [x] `POST /ai/decompose`（SSE：meta/op/done/error；role≥Editor）📄 API §7、AI §13
- [x] 校验流水线：协议校验(失败重试1次)→Schema校验(逐节点)→业务约束(数量/查重)📄 AI §5
- [x] 规整为统一 Proposal（ops/valid/issues/modelMeta）📄 AI §4
- [~] 中断（透传 abort）+ 超时（总60s）✓；流式 partial 为「聚合后逐 op 推送」（模型级流式 partial 后续）📄 AI §6
- [~] maxChildren≤20 ✓；depth 最小闭环固定 1（depth>1 后续）📄 AI §11

### M2.4 diff 预览（前端）
- [x] 虚影节点渲染（半透明虚线 + ✓/✗ 角标）；单个/全部 接受·拒绝·就地编辑标题 📄 AI §7
- [x] 确认 → 命令层 ApplyProposal（同 batchId）→ Yjs 写入 + `aiGenerate` 事件
- [x] **未确认不进 Y.Doc、不参与协同同步**（本地 UI 态）
- [ ] `POST /ai/proposals/:proposalId/apply`（审计/服务端编排；最小闭环用前端本地应用）📄 API §7

### M2.5 摘要 summarize（SSE）
- [ ] `POST /ai/summarize`（scope: nodeId 或 range；逐 token delta）📄 API §7

### M2.6 里程碑（人工 + AI 辅助）
- [ ] `milestones` 表 + CRUD（GET/POST/PATCH/DELETE）📄 API §8、数据模型 §3.6
- [ ] 手动标记：名称+说明+锚定节点+关联时间区间
- [ ] `POST /projects/:id/milestones/ai-suggest`：扫描变更建议里程碑 + 区间摘要初稿
- [ ] 时间轴叠加里程碑标记（点击展开）

---

## M3 · 权限与人员（中粒度）

> 验收：「只看某人」骨架完整；人员替换不篡改历史

- [ ] **软权限**：节点/分支 `private`；effectivePrivate 继承；`canSeeContent` 判定；骨架灰条呈现；私有声明确认弹窗 📄 权限 §3
- [ ] **视图过滤层**：按 负责人/状态/标签/类型/时间（AND/OR）；未命中折叠骨架、保留根→命中路径半显；一键 看全部⇄只看某人（纯本地）📄 权限 §4
- [ ] **角色权限矩阵落地**：REST Guard + 协同 onAuthenticate + 命令层校验；`GET /projects/:id/permissions`；`PATCH 成员角色`（不超租户上限）📄 权限 §2/§7/§11
- [ ] **人员全局替换**：`transfer_jobs` 表；preview/execute/:jobId；扫描 owner/collab/@提及/成员席位；乐观校验幂等；历史 actor 不变；后台分批+进度；可选 IM 通知 📄 权限 §6、API §9
- [ ] **评论 & @**：`comments` 表；节点级评论；@ 触发通知 📄 数据模型 §3.7、主文档 F8

---

## M4 · 拓展（中粒度）

> 验收：手动发布送达 IM；子项目可下钻；Schema 变更可批量迁移并回滚

- [ ] **IM 渠道与手动发布**：`im_channels` 表；GET/POST/DELETE 渠道（config 加密）；`POST /im/publish`（node/milestone/summary 卡片）；适配 企微/钉钉/飞书/Slack/Webhook 📄 API §10、数据模型 §3.10
- [ ] **父子项目 & 跨项目引用**：项目树；节点下钻子项目（独立 MindMap，A7）；跨项目镜像引用（跳转不复制）📄 主文档 F9
- [ ] **AI 对话式 converse / 补全查重 complete / 改写 rewrite**（SSE，输出统一提案）📄 API §7、AI §1
- [ ] **Schema 迁移工具**：`schema_migrations` 表；DSL + 5 算子(renameField/setDefault/convertType/mapEnum/dropField)；preview/execute/:id/rollback；乐观校验；事件逆放回滚（默认7天，租户可配1–30天）；跨项目逐项目授权 📄 Schema迁移全篇、API §5

---

## M5 · 体验（中粒度）

> 验收：5000 节点 3D 总览 ≥30FPS + 可下钻；私有部署一键拉起

- [ ] **3D 总览（react-three-fiber，只读）**：径向球面/分层悬浮布局；实例化渲染+LOD+视锥剔除；点击节点下钻定位回 2D 📄 主文档 F10
- [ ] **大图性能优化**：子树懒加载、正文延迟同步（骨架先到）；分数索引 reindex 维护任务 📄 Yjs §8、主文档 §8
- [ ] **私有化部署整包**：Docker Compose / K8s Helm；依赖全自托管；无外网时模型网关指向本地/客户 Key 📄 主文档 §5.7

---

## M6 · 进阶（中粒度）

> 验收：无权者根本拿不到内容；规则自动推送

- [ ] **硬权限隔离（内容子文档）**：骨架文档 + 内容子文档拆分；按 `canSeeContent` 分片鉴权下发；跨权限域移动节点处理 📄 权限 §5、主文档 §5.6
- [ ] **IM 订阅自动推送**：`im_subscriptions` 表 + 订阅引擎；规则触发（分支变更/里程碑达成/@我）📄 数据模型 §3.10、主文档 F12
- [ ] **移动端适配深化** 📄 主文档 §2.4

---

## 贯穿性事项（全程并行）

- [ ] **测试**：单元 / 集成 / E2E（协同多端、AI 校验与降级、迁移回滚、权限矩阵、人员替换幂等）
- [ ] **可观测性**：日志/指标/链路；AI 请求日志可验证含父链+兄弟标题 📄 AI §9
- [ ] **安全**：JWT、租户行级隔离、TLS、附件签名 URL、配置加密、审计（change_events 即审计流）📄 主文档 §6
- [ ] **国际化**：文案外置，首版中文，预留多语言
- [ ] **SSE 联调**：私有部署反代禁用缓冲（`X-Accel-Buffering: no`）📄 API §12
- [ ] **文档单一事实来源同步**：表结构/契约变更同步回写 主文档 §3.2 / 数据模型 / API 契约总览

---

## 文档勘误（建议修订，不阻塞开发）

- [ ] 主文档 §3.2 `projects` 表仍列 `map_id`，DDL 已改为"不冗余、由 maps.project_id join"——主文档该处待同步 📄 数据模型 §3.2
- [ ] 主文档 附录D IM 示例链接残留旧占位名 `app.mindflow.example`（应为 mindline）

---

*（TODOLIST 结束。完成项请勾选；范围/排期调整请同步更新本文件。）*
