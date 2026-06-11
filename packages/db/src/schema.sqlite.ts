/**
 * SQLite 兼容 schema —— 仅用于本地开发（DB_DRIVER=sqlite）。
 * 与 schema.ts 保持结构一致，类型映射：
 *   bytea        → blob()
 *   timestamp    → integer({ mode: 'timestamp' })
 *   boolean      → integer({ mode: 'boolean' })
 *   jsonb        → text({ mode: 'json' })
 *   bigint       → integer()
 *   text.array() → text({ mode: 'json' }).$type<string[]>()
 *   GIN index    → 普通 index（SQLite 不支持 GIN）
 */
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  blob,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/sqlite-core';

// ===================== 租户与用户 =====================

export const tenants = sqliteTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    deployMode: text('deploy_mode').notNull().default('saas'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [check('tenants_deploy_mode_ck', sql`${t.deployMode} in ('saas','private')`)],
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email'),
    phone: text('phone'),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    passwordHash: text('password_hash'),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    check('users_status_ck', sql`${t.status} in ('active','disabled','left')`),
    uniqueIndex('uq_users_email')
      .on(t.tenantId, t.email)
      .where(sql`${t.email} is not null`),
    uniqueIndex('uq_users_phone')
      .on(t.tenantId, t.phone)
      .where(sql`${t.phone} is not null`),
  ],
);

// ===================== 空间 / 项目 / 思维导图 =====================

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    inheritMembers: integer('inherit_members', { mode: 'boolean' }).notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: 'projects_parent_fk' }).onDelete(
      'set null',
    ),
    index('ix_projects_tenant').on(t.tenantId),
    index('ix_projects_parent').on(t.parentId),
  ],
);

export const maps = sqliteTable('maps', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

// ===================== 成员与权限 =====================

export const projectMembers = sqliteTable(
  'project_members',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    inherited: integer('inherited', { mode: 'boolean' }).notNull().default(false),
    addedAt: integer('added_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    check('project_members_role_ck', sql`${t.role} in ('owner','admin','editor','commenter','viewer')`),
    index('ix_members_user').on(t.userId),
  ],
);

// ===================== 节点类型 Schema 与版本 =====================

export const nodeTypeSchemas = sqliteTable(
  'node_type_schemas',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    typeKey: text('type_key').notNull(),
    definition: text('definition', { mode: 'json' }).notNull(),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    // 拆成两个部分唯一索引来模拟 PG 的 coalesce(projectId, '__global__') 技巧：
    // ① 全局 schema（projectId IS NULL）：同租户下 typeKey 唯一
    uniqueIndex('uq_node_type_global')
      .on(t.tenantId, t.typeKey)
      .where(sql`${t.projectId} is null`),
    // ② 项目 schema（projectId IS NOT NULL）：同租户同项目下 typeKey 唯一
    uniqueIndex('uq_node_type_project')
      .on(t.tenantId, t.projectId, t.typeKey)
      .where(sql`${t.projectId} is not null`),
  ],
);

export const nodeTypeSchemaVersions = sqliteTable(
  'node_type_schema_versions',
  {
    id: text('id').primaryKey(),
    schemaId: text('schema_id')
      .notNull()
      .references(() => nodeTypeSchemas.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    definition: text('definition', { mode: 'json' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_schema_version').on(t.schemaId, t.version)],
);

// ===================== 协同文档存储 =====================

export const yjsUpdates = sqliteTable(
  'yjs_updates',
  {
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    update: blob('update').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mapId, t.seq] })],
);

export const yjsSnapshots = sqliteTable(
  'yjs_snapshots',
  {
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    state: blob('state').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mapId, t.version] })],
);

// ===================== 变更事件 =====================

export const changeEvents = sqliteTable(
  'change_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    op: text('op').notNull(),
    field: text('field'),
    before: text('before', { mode: 'json' }),
    after: text('after', { mode: 'json' }),
    batchId: text('batch_id'),
    // PG text[].array() → SQLite JSON 文本（存储 string[] | null）
    pathIds: text('path_ids', { mode: 'json' }).$type<string[] | null>(),
    ts: integer('ts', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'change_events_op_ck',
      sql`${t.op} in ('create','delete','move','rename','setField','setOwner','transfer','aiGenerate','comment')`,
    ),
    index('ix_changes_map_ts').on(t.mapId, t.ts),
    index('ix_changes_node').on(t.nodeId, t.ts),
    index('ix_changes_batch')
      .on(t.batchId)
      .where(sql`${t.batchId} is not null`),
    index('ix_changes_actor').on(t.actorId, t.ts),
    // GIN index 降级为普通 index（开发用量无性能压力）
    index('ix_changes_path').on(t.pathIds),
  ],
);

// ===================== AI 配置与用量 =====================

export const aiProviderConfigs = sqliteTable(
  'ai_provider_configs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    config: text('config', { mode: 'json' }).notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_ai_default')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
  ],
);

export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    capability: text('capability').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    ts: integer('ts', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ai_usage_capability_ck',
      sql`${t.capability} in ('decompose','summarize','complete','converse','rewrite')`,
    ),
    index('ix_ai_usage_tenant_ts').on(t.tenantId, t.ts),
  ],
);

// ===================== 评论（M3） =====================

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    mentions: text('mentions', { mode: 'json' }).$type<string[] | null>(),
    resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [index('ix_comments_node').on(t.nodeId, t.createdAt)],
);

// ===================== 人员替换任务（M3） =====================

export const transferJobs = sqliteTable(
  'transfer_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    scope: text('scope').notNull(),
    scopeId: text('scope_id'),
    status: text('status').notNull().default('running'),
    processed: integer('processed').notNull().default(0),
    total: integer('total').notNull().default(0),
    conflicts: text('conflicts', { mode: 'json' }).$type<
      Array<{ nodeId: string; reason: string }> | null
    >(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [
    check('transfer_jobs_scope_ck', sql`${t.scope} in ('project','workspace','tenant')`),
    check('transfer_jobs_status_ck', sql`${t.status} in ('running','done','failed')`),
    uniqueIndex('uq_transfer_running')
      .on(t.tenantId, t.fromUserId, t.scope)
      .where(sql`${t.status} = 'running'`),
  ],
);

// ===================== 里程碑 =====================

export const milestones = sqliteTable(
  'milestones',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    nodeId: text('node_id'),
    title: text('title').notNull(),
    description: text('description'),
    aiSummary: text('ai_summary'),
    rangeStart: integer('range_start', { mode: 'timestamp' }),
    rangeEnd: integer('range_end', { mode: 'timestamp' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (t) => [index('ix_milestones_project').on(t.projectId, t.rangeStart)],
);

export const sqliteSchema = {
  tenants,
  users,
  workspaces,
  projects,
  maps,
  projectMembers,
  nodeTypeSchemas,
  nodeTypeSchemaVersions,
  yjsUpdates,
  yjsSnapshots,
  changeEvents,
  aiProviderConfigs,
  aiUsage,
  milestones,
  comments,
  transferJobs,
};
