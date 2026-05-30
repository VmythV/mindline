/**
 * 领域核心类型 —— 汇总自主文档 §3.3、数据模型/DDL、API契约总览 §11、Yjs/AI 详设。
 * 这是前后端共享的单一事实来源（类型层）。
 */

// ===== 租户 / 用户 =====
export type DeployMode = 'saas' | 'private';
export type UserStatus = 'active' | 'disabled' | 'left';

// ===== 角色（项目级）—— 权限与过滤详设 §2 =====
export const ROLES = ['owner', 'admin', 'editor', 'commenter', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

// ===== 节点类型 Schema —— 主文档 §3.3 =====
export const FIELD_TYPES = [
  'text',
  'richtext',
  'number',
  'date',
  'datetime',
  'enum',
  'multiEnum',
  'user',
  'link',
  'checkbox',
  'tags',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: unknown;
  options?: string[]; // enum / multiEnum 取值
  unit?: string;
  collab?: boolean; // true → 存为 Y.Text（多人实时编辑）
  uiHint?: string;
}

export interface NodeTypeDefinition {
  typeKey: string;
  displayName: string;
  icon?: string;
  color?: string;
  fields: FieldDef[];
  aiHints?: string;
}

// ===== 节点（快照形态，REST）—— API §11 =====
export interface NodeLink {
  kind: 'reference' | 'subproject';
  targetId: string; // n_* 或 p_*
}

export interface NodeSnapshot {
  id: string;
  parentId: string | null;
  order: string; // 分数索引（fractional indexing）
  type: string; // typeKey
  title: string;
  ownerId: string | null;
  status?: string;
  tags?: string[];
  collaborators?: string[];
  data: Record<string, unknown>;
  links?: NodeLink[];
  private?: boolean;
}

// ===== 变更事件 —— 数据模型 §3.6 / Yjs §4.1 =====
export const CHANGE_OPS = [
  'create',
  'delete',
  'move',
  'rename',
  'setField',
  'setOwner',
  'transfer',
  'aiGenerate',
  'comment',
] as const;
export type ChangeOp = (typeof CHANGE_OPS)[number];

export interface ChangeEvent {
  id: string;
  mapId: string;
  nodeId: string;
  actorId: string;
  op: ChangeOp;
  field?: string | null;
  before?: unknown;
  after?: unknown;
  batchId?: string | null;
  ts: number; // epoch 毫秒
}

// ===== AI 能力与提案 —— AI拆解详设 §1 / §4 =====
export const AI_CAPABILITIES = [
  'decompose',
  'summarize',
  'complete',
  'converse',
  'rewrite',
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export type ProposalOpKind = 'addChild' | 'addSibling' | 'updateField' | 'merge' | 'delete';

export interface ProposalOp {
  tempId: string;
  op: ProposalOpKind;
  parentRef?: string; // 真实父 id 或上一个 tempId
  node?: Partial<NodeSnapshot> & { type: string; title: string };
  valid: boolean;
  issues: string[];
}

export interface ProposalModelMeta {
  provider: string;
  model: string;
  tokens: { in: number; out: number };
}

export interface Proposal {
  proposalId: string;
  capability: AiCapability;
  mapId: string;
  anchorNodeId: string;
  batchId: string;
  ops: ProposalOp[];
  modelMeta?: ProposalModelMeta;
}
