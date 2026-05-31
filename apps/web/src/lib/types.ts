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
