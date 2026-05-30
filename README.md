# 思谱 Mindline

> 思维导图 × AI 拆解 × 时间轴 —— 面向团队的结构化协作平台。

实时协同思维导图，用 AI 把模糊目标拆成可执行的层级结构，并以时间轴沉淀每一次变更与里程碑。SaaS 多租户 + 可私有化部署。

详细方案见 [`docs/`](./docs)：产品需求文档、数据模型/DDL、API 契约、Yjs 协同、AI 拆解、权限与过滤、Schema 迁移等。开发计划见 [`docs/TODOLIST.md`](./docs/TODOLIST.md)。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React + TypeScript + Vite，2D 用 React Flow，3D 用 react-three-fiber（只读） |
| 协同 | Yjs（CRDT）+ Hocuspocus |
| 后端 | NestJS（Node/TS） |
| 数据 | PostgreSQL / Redis / MinIO |
| AI | 多模型网关（OpenAI 兼容协议优先） |

## 仓库结构（monorepo · pnpm + Turborepo）

```
mindline/
├── apps/
│   ├── web/      前端（React + Vite）
│   ├── api/      应用后端（NestJS）
│   └── collab/   协同服务（Hocuspocus）
├── packages/
│   └── shared/   跨端共享类型与契约（ID 前缀 / 错误码 / 领域模型 / 命令层契约）
└── docs/         方案与详设文档
```

## 快速开始

前置：Node ≥ 22、pnpm 10、Docker。

```bash
# 1. 安装依赖
pnpm install

# 2. 启动本地基础设施（Postgres / Redis / MinIO）
pnpm infra:up

# 3. 准备环境变量
cp .env.example .env

# 4. 开发模式（待各 app 接入后）
pnpm dev
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动所有 app 开发模式 |
| `pnpm build` | 构建所有包 |
| `pnpm lint` | 代码检查 |
| `pnpm typecheck` | 类型检查 |
| `pnpm test` | 运行测试 |
| `pnpm format` | Prettier 格式化 |
| `pnpm infra:up` / `pnpm infra:down` | 起停本地基础设施 |
