import type { FieldDef } from '@mindline/shared';

export interface AuthUser {
  id: string;
  tenantId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Project {
  id: string;
  name: string;
  parentId: string | null;
  mapId: string | null;
  archived: boolean;
}

export interface ProjectList {
  items: Project[];
  nextCursor: string | null;
}

export interface ProjectDetail extends Project {
  inheritMembers: boolean;
  myRole: string;
  memberCount: number;
}

export interface ChangeEventView {
  id: string;
  nodeId: string;
  actorId: string;
  actorName: string;
  op: string;
  field: string | null;
  before: unknown;
  after: unknown;
  batchId: string | null;
  ts: number;
}

export interface ChangeList {
  items: ChangeEventView[];
  nextCursor: string | null;
}

export interface NodeTypeDefinition {
  typeKey: string;
  displayName: string;
  icon?: string;
  color?: string;
  fields: FieldDef[];
  aiHints?: string;
}

export interface NodeTypeItem {
  id: string;
  typeKey: string;
  version: number;
  scope: string;
  definition: NodeTypeDefinition;
}

export interface NodeTypeList {
  items: NodeTypeItem[];
}

export interface ProviderItem {
  id: string;
  provider: string;
  endpoint: string;
  model: string | null;
  apiKeyMask: string;
  isDefault: boolean;
  enabled: boolean;
  createdAt: number;
}

export interface ProviderList {
  items: ProviderItem[];
}

export interface UsageRow {
  provider: string;
  model: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

export interface UsageResp {
  items: UsageRow[];
  totals: { calls: number; tokensIn: number; tokensOut: number };
}

export interface MilestoneItem {
  id: string;
  projectId: string;
  nodeId: string | null;
  title: string;
  description: string | null;
  aiSummary: string | null;
  rangeStart: number | null;
  rangeEnd: number | null;
  createdBy: string;
  createdAt: number;
}

export interface MilestoneList {
  items: MilestoneItem[];
}

export interface SuggestResp {
  suggestions: { title: string; reason: string; anchorNodeId: string | null }[];
  summaryDraft: string;
}
