# 思谱 Mindline · 开发 TODOLIST

> 依据 `思谱-需求文档.md`（PRD + 技术架构 v0.1）与 `detail/` 下 6 份详设生成。
> 本版以**目标功能视角**重组：先对照核心功能交付现状，再列剩余工作。

| 项       | 内容                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| 版本     | v0.2                                                                                                        |
| 更新日期 | 2026-06-21                                                                                                  |
| 调整说明 | 按目标功能清单重组；新增 CLI 模块；M6（硬权限/IM订阅/移动端）移出范围；工程化降级为「后续按需」；关闭过时项 |
| 技术栈   | React+TS+Vite / NestJS / Hocuspocus+Yjs / Postgres+Redis+MinIO / 多模型 AI 网关                             |

**图例**：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · 📄 文档出处 · ⚠️ 需先拍板的风险点 · 🔗 依赖

---

## 一、核心功能交付现状（目标功能对照）

| #   | 目标功能                         | 现状        | 落点                             |
| --- | -------------------------------- | ----------- | -------------------------------- |
| 1   | 思维导图（2D 树编辑）            | ✅ 完成     | M0.7                             |
| 2   | AI 拆解（关联父/子/兄弟节点）    | ✅ 完成     | M2.2 / M2.3                      |
| 3   | 每个节点可存储信息               | ✅ 完成     | M0.4                             |
| 4   | 存储字段可自定义（Schema）       | ✅ 完成     | M0.4 + M1.4 + M4 迁移            |
| 5   | 变更记录                         | ✅ 完成     | M0.6 ChangeEvent                 |
| 6   | 时间轴展示变更                   | ✅ 完成     | M1.2                             |
| 7   | 时间轴总结大事件 / 里程碑        | ✅ 完成     | M2.6（含 AI 建议）               |
| 8   | 新建/删除/变更/预览节点          | ✅ 完成     | M0.7 + M1.3                      |
| 9   | 快捷键                           | ✅ 完成     | M0.7 + M1.3                      |
| 10  | 节点内容快速修改                 | ✅ 完成     | M1.3 + Tiptap                    |
| 11  | **3D 树**                        | ❌ 未做     | 见「剩余工作 · B」               |
| 12  | 人员只看自己内容 + 保留层级      | ✅ 完成     | M3 视图过滤 + 软权限             |
| 13  | 人员全局替换（离职移交）         | 🟡 部分     | M3（Yjs 侧 ownerId 待补）        |
| 14  | 多人协作                         | 🟡 基本完成 | M0.5 / M1.1（多实例 e2e 待验证） |
| 15  | 父子项目                         | ✅ 完成     | M4                               |
| 16  | 右键快捷方式                     | ✅ 完成     | M1.3                             |
| 17  | 发布集成 IM（手动发送消息）      | ✅ 完成     | M4                               |
| 18  | **CLI（配 SKILL 操作整个软件）** | ❌ 全新     | 见「剩余工作 · A」               |

---

## 二、剩余工作

### A · CLI（新增 · 面向 AI agent 的操作入口）🔥

> 定位：用户安装该 CLI 后，配置为 AI 的 SKILL，AI 即可通过它对思谱整个软件进行操作（建项目/增删改节点/跑 AI 拆解/查时间轴/发布 IM 等）。
> 设计原则：**对 agent 友好**——命令可组合、输出结构化（JSON）、错误码与 `@mindline/shared` 对齐、薄封装现有 `/api` REST + SSE，不另起业务逻辑。

**路线 1（已交付）· 只读查询 + 非协同 REST 写 + AI 结果展示**

- [x] 新建 `apps/cli`（Node 22 + tsup 打包 + bin `mindline` + 复用 `@mindline/shared`；薄封装 `/api`）
- [x] 鉴权：`login` / `logout` / `whoami`；凭证存 `~/.mindline/config.json`（0600）+ 401 自动刷新；`--token`/`--api` 覆盖
- [x] 输出协议：默认人类可读，`--json` 输出 `{ok,data}` / `{ok,error}`（错误码与 shared 对齐）+ 非零退出码
- [x] `project`：list（含 mapId）/ get / create（含父子项目）
- [x] `node`：tree（快照树形）/ get（单节点含自定义字段）——**只读**
- [x] `ai decompose`：SSE 跑拆解，输出子节点提案（展示，不写回）
- [x] `ai summarize`：SSE 子树摘要
- [x] `timeline` / `history`：变更时间轴 + 节点字段级历史（支持人/操作/分支/时间过滤）
- [x] `im channels` / `im publish`：列渠道 + 发布卡片
- [x] SKILL 集成包 `apps/cli/SKILL.md`（命令速查 + 典型流程，可直接挂载）+ README

**路线 2（已交付）· 节点协同写入 + 提案写回（方案 D）**

- [x] 命令层下沉 `packages/map-core`（MapRepository + NodeView + EmitEvent；web re-export 零回归）
- [x] `Command` 契约入 `packages/shared`（createChild/rename/setField/setType/move/delete/applyProposal）
- [x] api 写通道 `apps/api/src/maps`：`POST /maps/:mapId/commands` → 经 Hocuspocus provider 连 collab 执行命令层 → `ChangesService.append` 落库 → collab 广播（连接池 + 闲置 TTL；Editor+）
- [x] CLI 写命令：`node create / rename / move / delete / set-field`
- [x] `ai decompose --apply`：SSE 重建 Proposal → `applyProposal` 命令写回（产出 `aiGenerate` 批量事件）
- [ ] 后续优化：连接池跨多 api 实例的复用度量、写后强一致读（当前快照读仍可能滞后数秒）

### B · 3D 树（只读总览）

- [x] 3D 总览（react-three-fiber，只读）：**分层径向树**布局（`layout3d.ts`）📄 主文档 F10
- [x] 实例化渲染（InstancedMesh 单 draw call + hover-only 标签 + 批量边）；OrbitControls 旋转/缩放/漫游
- [x] 点击节点下钻定位回 2D（复用 `pendingFocusId`→setCenter；MapPage `view` 切换 + lazy 加载 three）
- [x] 径向球面布局切换（`layout3d` tree/sphere + header 切换按钮）
- [x] 被折叠节点下钻自动展开（MapCanvas focus effect 清除被折叠祖先）
- [ ] 后续：距离裁剪、子树懒加载/正文延迟同步 📄 Yjs §8
  - ⏳ **待你实机验证**：5000 节点 ≥30FPS 浏览器实测（InstancedMesh 单 draw call 已就位）；3D 旋转/缩放/hover/下钻交互

### C · 补齐已有功能的尾巴

- [x] **人员替换 · Yjs 侧**：命令层补 `setOwner`；`CollabWriterService.replaceOwner` 批量改挂受影响 map 内 ownerId；transfer execute 复用（返回 `ownerReplaced`，失败记 conflicts）；preview 真实统计 owner 节点数 📄 权限 §6
  - 注：preview 读落库快照统计可能滞后；execute 用 live doc 准确替换。已端到端验证（ownerReplaced=1、节点 owner 改挂、setOwner 审计事件）
- [ ] **多实例协作验证**：真·多实例 Redis 广播 + 持久化 e2e（`scripts/e2e.mjs` 需 Postgres）📄 Yjs §10
- [ ] **D1 落库可靠性收尾**：collab 服务端语义反推兜底（覆盖浏览器硬崩溃极窄窗口）📄 Yjs §4.3
- [ ] **AI 增强**（M2 尾巴，非必需）：
  - [ ] 启动探测每模型能力 `{stream, functionCall, jsonMode}` 📄 AI §11
  - [x] depth>1 多层拆解（迭代 BFS 逐层拆，parentRef 指向上层 tempId，深层 maxChildren 收敛 + frontier 截断防爆炸；depth 上限 3）
  - [x] 模型级流式 partial（`callGatewayStream` 增量解析 function call arguments，每完整子节点即 emit；content 兜底；stub 逐个吐出）
  - [ ] range 时间区间摘要（当前仅 nodeId 子树）
  - ⏳ **待你实机验证（需真实 AI 网关）**：depth=2/3 多层拆解效果、流式首字延迟（stub 模式下无真实流式）

> **本轮（AI/3D 打磨）代码状态**：全量 typecheck（12 包）+ lint 通过；后端单测 25 个通过（validate 重构无破坏）。
> 端到端/浏览器/真实网关验证未做（按约定留待你实机运行）。`pnpm test` 因 cli/map-core 暂无测试文件会整体 exit 1（非代码问题）。

---

## 三、后续按需（暂缓 · 不在当前范围）

> 不影响功能闭环，等上线/规模化需要时再启动。

- [ ] **工程化 / CI-CD**：CI 流水线（lint+typecheck+test+build+命令层拦截检查）、镜像构建（web/api/collab/cli）、部署骨架
- [ ] **测试补全**：web 命令层（MapRepository diff 反推）/ 集成 / E2E / AI 降级 / 迁移回滚 / 人员替换幂等
- [ ] **私有化部署整包**：Docker Compose / K8s Helm 全自托管 📄 主文档 §5.7
- [ ] **可观测性**：日志/指标/链路；AI 请求日志验证含父链+兄弟标题 📄 AI §9
- [ ] **安全梳理**：TLS、附件签名 URL、配置加密复核、审计 📄 主文档 §6
- [ ] **国际化**：文案外置，预留多语言
- [ ] **.env schema 校验**、SSE 反代禁缓冲（`X-Accel-Buffering: no`）
- [ ] **文档单一事实来源同步**：表结构/契约变更回写主文档 / 数据模型 / API 契约

---

## 四、已移出范围

> 经评审本阶段不做（如需恢复请重新纳入）。

- ~~M6 · 硬权限隔离（内容子文档拆分）~~
- ~~M6 · IM 订阅自动推送（订阅引擎 + 规则触发）~~
- ~~M6 · 移动端适配深化~~

---

## 五、已交付里程碑存档（M0–M4）

> 简明记录，便于回溯；实现细节见代码与 git 历史。

### 阶段0 · 启动准备

- [x] monorepo（pnpm workspace + Turborepo）：web / api / collab + shared / db / infra
- [x] TS 严格模式 base 配置、ESLint + Prettier
- [x] 命令层 ESLint 规则（禁止 `map/**` 外 import yjs）
- [x] Vitest 接入（api / shared）；Docker Compose（PG/Redis/MinIO）
- [x] Drizzle ORM + drizzle-kit 迁移；共享契约（domain/ids/errors）

### M0 · 地基

- [x] 核心 DDL + 多租户 tenant_id scope（ALS 上下文中间件）
- [x] 认证：register/login/refresh/me；JWT + 全局 JwtGuard + @Public
- [x] 项目 CRUD（含父子）+ 成员角色（owner/admin/editor/commenter/viewer）+ 建项目自动建 map
- [x] 节点类型 Schema 系统：11 种字段类型 + 7 个内置模板 + 动态表单
- [x] Yjs 协同内核：扁平 nodes Map + 分数索引 + onAuthenticate/onLoad/onStore + Redis 多实例广播
- [x] 命令层 MapRepository（唯一写入口）+ ChangeEvent 持久重试队列落库
- [x] 2D 树编辑：React Flow + 视口虚拟化 + 快捷键 + 拖拽改父 + Tiptap 富文本
- [x] 撤销重做（Y.UndoManager + 补偿 ChangeEvent）

### M1 · 协同与历史

- [x] Awareness 在线协作（光标/选区/编辑徽标/在线头像/心跳清除）
- [x] 变更历史 + 项目时间轴（batchId 折叠/过滤：人/操作/分支/时间）+ 节点字段级 diff
- [x] 交互体系：命令面板 Cmd+K / 搜索 Cmd+F / 右键菜单 / Space 预览
- [x] 自定义字段表单完善（PUT node-types 升版 + 类型切换保旧值）

### M2 · AI 首发

- [x] AI 模型网关（OpenAI 兼容 + 多租户凭证 AES-256-GCM + 路由 + 计量 + stub 降级）
- [x] Context Builder（target/ancestors/siblings/children/schema + token 预算裁剪）
- [x] decompose SSE + 三层校验流水线 → 统一 Proposal
- [x] diff 虚影预览（前端本地态，确认走命令层 applyProposal 写回）
- [x] summarize SSE（子树摘要）+ 里程碑 CRUD + AI 建议里程碑 + 时间轴叠加

### M3 · 权限与人员

- [x] 软权限（节点/分支 private + 骨架灰条）+ 视图过滤（只看我的）
- [x] 角色权限矩阵 `GET /projects/:id/permissions`
- [x] 人员全局替换（transfer_jobs：preview/execute/查询，DB 席位）
- [x] 评论 & @（comments 表 + NodeInspector 面板）

### M4 · 拓展

- [x] IM 渠道 + 手动发布（企微/钉钉/飞书/Slack/Webhook）
- [x] 父子项目树 + 跨项目镜像引用
- [x] AI converse / complete / rewrite（SSE 统一提案）
- [x] Schema 迁移工具（DSL + 5 算子 + preview/execute/rollback + 事件逆放）

---

_（TODOLIST 结束。完成项请勾选；范围/排期调整请同步更新本文件。）_
