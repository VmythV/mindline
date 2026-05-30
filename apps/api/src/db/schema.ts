/**
 * Drizzle schema —— 思谱 Mindline 数据层（M0 表）。
 * 单一事实来源：docs/detail/数据模型与DDL.md §3.1–3.6。
 *
 * 约定：
 *  - 主键 text（`<前缀><ULID>`，应用层生成，见 @mindline/shared newId）。
 *  - 枚举用 text + CHECK（加值无需 ALTER TYPE，迁移更轻）。
 *  - 时间 timestamptz；协同二进制用 bytea。
 *  - 注：部分 DDL 中 ts DESC 的索引此处用普通 btree（Postgres 可反向扫描，
 *    功能等价），如需严格降序索引后续调整。
 */
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  customType,
  uniqueIndex,
  index,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';

/** Yjs 二进制 update / snapshot 存储类型 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ===================== 租户与用户（M0） =====================

export const tenants = pgTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    deployMode: text('deploy_mode').notNull().default('saas'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('tenants_deploy_mode_ck', sql`${t.deployMode} in ('saas','private')`)],
);

export const users = pgTable(
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
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

// ===================== 空间 / 项目 / 思维导图（M0） =====================

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    archived: boolean('archived').notNull().default(false),
    inheritMembers: boolean('inherit_members').notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: 'projects_parent_fk' }).onDelete(
      'set null',
    ),
    index('ix_projects_tenant').on(t.tenantId),
    index('ix_projects_parent').on(t.parentId),
  ],
);

export const maps = pgTable('maps', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===================== 成员与权限（M0） =====================

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    inherited: boolean('inherited').notNull().default(false),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    check('project_members_role_ck', sql`${t.role} in ('owner','admin','editor','commenter','viewer')`),
    index('ix_members_user').on(t.userId),
  ],
);

// ===================== 节点类型 Schema 与版本（M0） =====================

export const nodeTypeSchemas = pgTable(
  'node_type_schemas',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    typeKey: text('type_key').notNull(),
    definition: jsonb('definition').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 同租户内（全局 或 某项目）下 type_key 唯一
    uniqueIndex('uq_node_type').on(t.tenantId, sql`coalesce(${t.projectId}, '__global__')`, t.typeKey),
  ],
);

export const nodeTypeSchemaVersions = pgTable(
  'node_type_schema_versions',
  {
    id: text('id').primaryKey(),
    schemaId: text('schema_id')
      .notNull()
      .references(() => nodeTypeSchemas.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_schema_version').on(t.schemaId, t.version)],
);

// ===================== 协同文档存储（M0） =====================

export const yjsUpdates = pgTable(
  'yjs_updates',
  {
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    update: bytea('update').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mapId, t.seq] })],
);

export const yjsSnapshots = pgTable(
  'yjs_snapshots',
  {
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    state: bytea('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mapId, t.version] })],
);

// ===================== 变更事件（M0 落库 / M1 时间轴） =====================

export const changeEvents = pgTable(
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
      .references(() => users.id, { onDelete: 'restrict' }), // 保真
    op: text('op').notNull(),
    field: text('field'),
    before: jsonb('before'),
    after: jsonb('after'),
    batchId: text('batch_id'),
    pathIds: text('path_ids').array(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
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
    index('ix_changes_path').using('gin', t.pathIds),
  ],
);

export const schema = {
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
};
