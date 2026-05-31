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
