# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

思谱 Mindline：实时协同思维导图 + AI 拆解 + 变更时间轴。SaaS 多租户，可私有化部署。MVP 范围 M0–M2，进度见 `docs/TODOLIST.md`。

## 常用命令

```bash
# 全量（Turborepo 编排所有包）
pnpm build | pnpm lint | pnpm typecheck | pnpm format

# 单包（开发时优先用，快）
pnpm --filter @mindline/api typecheck      # 或 @mindline/web / @mindline/collab / @mindline/shared / @mindline/db
pnpm --filter @mindline/shared build

# 本地基础设施（Postgres 5432 / Redis 6379 / MinIO 9000）
pnpm infra:up | pnpm infra:down

# 应用服务：api(3001,/api 前缀) · collab(ws 3002) · web(5173)
pnpm services:dev      # 前台热更新（turbo dev）
pnpm services:start    # 后台（构建产物运行），日志在 logs/
pnpm services:stop

# 数据库（Drizzle）
pnpm db:generate       # 改 packages/db/src/schema.ts 后生成迁移
pnpm db:migrate
pnpm db:studio
```

**测试现状**：仓库当前无测试文件，各包未接入 Vitest（属 TODOLIST「贯穿性事项」未完成项）。`pnpm test` 可运行但无用例。新增测试需先在对应包配置 Vitest。

**单服务冒烟**：基础设施起来后可直接 `node apps/api/dist/main.js`（先 `pnpm --filter @mindline/api build`）。无 `.env` 也能跑——`DATABASE_URL`/`JWT_SECRET` 等有 fallback 默认值，与 docker-compose 一致。

## 仓库结构（pnpm workspace + Turborepo）

```
apps/
  web/                       前端（React + Vite + React Flow + Zustand + react-query）
    src/
      routes/                页面：LoginPage / ProjectsPage / MapPage
      map/                   思维导图核心
        MapRepository.ts     ★ 命令层 = Y.Doc 唯一写入口（见约定②）
        useMapDoc.ts         Hocuspocus 连接 + 派生节点列表 + onChanges 落库
        MapCanvas.tsx        React Flow 画布、快捷键、虚影预览叠加
        NodeCard.tsx         自定义节点（含 AI 虚影渲染分支）
        NodeInspector.tsx    节点详情侧栏（Schema 驱动表单 + 类型切换 + 历史）
        DynamicField.tsx     按 FieldType 渲染表单控件
        TimelinePanel.tsx    变更时间轴 + 过滤（人/操作/分支/时间）
        CommandPalette.tsx / ContextMenu.tsx   Cmd+K 命令面板 / 右键菜单
        useProposal.ts       AI 提案本地态（SSE 拉取 + 虚影 + 确认写回）
        layout.ts            树布局 + CardData/ShadowMeta
      lib/api.ts             api()（普通请求）+ apiStream()（SSE）
      stores/auth.ts         Zustand 鉴权态（token / user）
  api/                       后端（NestJS，全局前缀 /api，全局 JwtAuthGuard + ValidationPipe + 异常过滤器）
    src/
      auth/ projects/ node-types/ changes/ ai/    业务模块（controller + service + dto）
      common/               guards（JwtAuthGuard / ProjectRoleGuard）· decorators（@Public/@CurrentUser/@MinRole）· filters · roles.ts
      db/db.module.ts        DRIZZLE provider（全局，各 service @Inject(DRIZZLE)）
      app.module.ts / main.ts
  collab/                    协同服务（Hocuspocus）：index.ts 入口 · auth.ts onAuthenticate · persistence.ts 快照存取
packages/
  shared/src/                跨端契约：domain.ts（领域模型/Proposal/ChangeOp/SSE 事件）· ids.ts（前缀 + newId）· errors.ts · builtin-node-types.ts
  db/src/                    Drizzle：schema.ts（★ 表结构事实来源）· client.ts；迁移在 db/drizzle/
docs/                        detail/（6 份详设契约）· TODOLIST.md（进度）· 思谱-需求文档.md
scripts/                     infra-up/down · services-start/stop
```

新增后端业务模块的固定套路：建 `xxx/{xxx.module.ts, xxx.controller.ts, xxx.service.ts, dto/}`，在 `app.module.ts` 的 `imports` 注册；跨模块复用 service 时在其 module `exports`（如 `ChangesModule` 导出 `ChangesService` 供 `AiModule` 复用 `snapshot()`/`resolveMapAccess()`）。

## 关键架构约定（违反会出错）

**① `packages/shared` 与 `packages/db` 经 `dist` 被引用。** 改了它们的源码后，api/web 的 typecheck/build 仍读旧 `dist`——必须先 `pnpm --filter @mindline/shared build`（或 `pnpm build` 让 turbo 处理 `^build` 依赖）才能让上游看到新类型。`services:dev`/`dev` 脚本已自动先构建 shared+db。

**② 命令层是 Y.Doc 的唯一写入口（架构铁律，`docs/detail/Yjs协同详设.md` §11）。** 前端所有结构变更必须经 `apps/web/src/map/MapRepository.ts` 的命令方法（createChild/rename/setField/moveNode/deleteSubtree/setType/applyProposal），**业务代码不得直接 import yjs 写类型**。每条命令 = 单个 `doc.transact(fn, this.origin)` + 显式产出 `ChangeEvent`（`EmitEvent`）。批量操作（删子树、AI 应用）共享一个 `batchId`。

**③ ChangeEvent 由发起方客户端落库。** 命令产出的事件经 `useMapDoc` 的 `onChanges` → `POST /maps/:mapId/changes` 落 `change_events` 表；远端协同节点不重复派生（发起方掉线可能丢事件——服务端兜底 D1 待做）。`path_ids`（祖先链）在命令改文档前快照计算并落库，用于时间轴的 branch 子树过滤（D2 已定：记录事件发生时的链，不随移动回改）。

**④ 鉴权三层。** 全局 `JwtAuthGuard` 校验 access JWT 并注入 `req.user = {userId, tenantId}`（`@Public()` 放行）；`tenantId` 一律取自 JWT，**不接受 body 覆盖**。项目级权限用 `@UseGuards(ProjectRoleGuard)` + `@MinRole(role)`（路径含 `:id`/`:projectId` 时）；**路由不含 projectId 时**（如 changes/snapshot/ai），在 service 内用 `ChangesService.resolveMapAccess(mapId, ctx)` 反查 project 成员资格 + 角色。角色等级见 `apps/api/src/common/roles.ts`（viewer<commenter<editor<admin<owner）。

**⑤ ID 与枚举。** 主键 = `<前缀>+ULID`，应用层 `newId(entity)` 生成（前缀表 `packages/shared/src/ids.ts`），不做 DB 兜底。DB 枚举用 `text + CHECK`（非 PG enum，便于加值）。`packages/db/src/schema.ts` 是表结构单一事实来源。

## 数据流与模块拓扑

- **协同内核**：Y.Doc 用一个扁平 `nodes` Map（每节点含 `parentId/order/title/type` + data 字段），`order` 用分数索引（`fractional-indexing`）；children 由前端监听派生，不双写。`apps/collab`（Hocuspocus）的 `onStoreDocument` 防抖把全量快照（`Y.encodeStateAsUpdate`）落 `yjs_snapshots`（M0 为 snapshot-only，增量/压实后续）。
- **只读快照**：`GET /maps/:mapId/snapshot` 由 `apps/api` 用 yjs 解码 `yjs_snapshots` 最新一条为扁平 `NodeSnapshot[]`（读落库态，可能滞后于实时编辑数秒）。供导出/搜索/**AI 上下文**用。
- **AI 拆解链路**（`apps/api/src/ai/`）：`decompose.dto` → `context-builder`（从快照算 target/ancestors/siblings/children + targetSchema）→ `prompt`（system+user + `emit_subtree` 函数）→ `gateway`（薄适配 OpenAI 兼容 `/chat/completions`，functionCall 优先、降级 jsonMode；`AI_GATEWAY_URL` 为空时 **stub 降级**）→ `validate`（协议/Schema/业务三层校验 → `Proposal`）。`ai.controller` 用 `@Res()` **手写 SSE**（`meta`→`op`*→`done`/`error`），鉴权在写流前完成（失败走全局过滤器返 JSON）。
- **AI diff 预览（前端不进 Y.Doc）**：`useProposal` hook 持有提案本地态；虚影节点叠加在 React Flow 上（`NodeCard` 据 `shadow` 渲染半透明 + ✓/✗ 角标）；确认 → `MapRepository.applyProposal` 走命令层写回（共享 `batchId`，产出 `aiGenerate` 事件）。**未确认不进 Y.Doc、不参与协同**。
- **SSE 前端客户端**：`apps/web/src/lib/api.ts` 的 `apiStream` 用 `fetch + ReadableStream`（**不用 EventSource**，因需带 `Authorization` header）。普通请求用 `api()`；两者 401 均自动登出。
- **错误模型**：`AllExceptionsFilter` 统一输出 `{error:{code,message,details?}}`；错误码枚举在 `packages/shared/src/errors.ts`。

## 编码规范

- **运行时**：Node 22（`.nvmrc`）、pnpm 10、`engine-strict`。后端调外部 HTTP 用内置全局 `fetch`（无需 axios/undici）。
- **TypeScript**（`tsconfig.base.json`，全包继承）：`strict` + `noUncheckedIndexedAccess`（**数组/索引访问返回 `T | undefined`**，须判空或在确知非空处用 `!`）+ `noImplicitOverride` + `noFallthroughCasesInSwitch`、target ES2022。
- **Prettier**：单引号、带分号、`printWidth: 100`、2 空格、`trailingComma: all`。提交前 `pnpm format`。
- **ESLint**：`typescript-eslint` recommended；未用变量报错，但 `_` 前缀参数/变量忽略（`argsIgnorePattern/varsIgnorePattern: ^_`）；`dist/build/scripts/.turbo` 已 ignore。
- **待启用的架构 lint**（`eslint.config.mjs` 中占位注释）：将禁止 `apps/web/src` 非命令层目录直接 `import 'yjs'`，强制走 `MapRepository`（约定②）。新代码请提前遵守。
- **类型放置**：前后端共享的领域/契约类型一律加在 `packages/shared`（改后记得 build，见约定①）；仅前端 UI 用的类型放 `apps/web/src/**/types.ts`。
- **中文 + UTF-8**：注释与用户可见文案用中文。**JSDoc/块注释内避免出现 `*/` 字符序列**（如写 `meta/op*/done` 会提前结束块注释导致语法错乱——用「、」或顿号替代）。

## 文档即契约

`docs/detail/` 是单一事实来源：`数据模型与DDL.md`（表/索引）、`API契约总览.md`（接口/错误码/分页）、`Yjs协同详设.md`（命令层/Awareness）、`AI拆解详设.md`（上下文/校验/SSE 事件）、`权限与过滤详设.md`、`Schema迁移工具详设.md`。改动表结构或接口契约时应回写对应文档；进度勾选回写 `docs/TODOLIST.md`。
