import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { BUILTIN_NODE_TYPES, newId } from '@mindline/shared';
import { DRIZZLE } from '../db/db.module';
import { schema, type Database } from '../db';

interface TokenPayload {
  sub: string;
  tenantId: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 注册：开新租户 + owner 用户 + 内置节点类型模板（M0 简化，email 视为全局唯一）。 */
  async register(dto: {
    email: string;
    password: string;
    displayName: string;
    tenantName?: string;
  }) {
    const existing = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, dto.email))
      .limit(1);
    if (existing.length > 0) throw new ConflictException('该邮箱已注册');

    const tenantId = newId('tenant');
    const userId = newId('user');
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.tenants)
        .values({ id: tenantId, name: dto.tenantName ?? `${dto.displayName} 的空间` });
      await tx.insert(schema.users).values({
        id: userId,
        tenantId,
        email: dto.email,
        displayName: dto.displayName,
        passwordHash,
        status: 'active',
      });
      // 复制内置节点类型为该租户的全局模板（project_id = null）
      await tx.insert(schema.nodeTypeSchemas).values(
        BUILTIN_NODE_TYPES.map((def) => ({
          id: newId('nodeType'),
          tenantId,
          projectId: null,
          typeKey: def.typeKey,
          definition: def,
          version: 1,
        })),
      );
    });

    return {
      ...this.issueTokens(userId, tenantId),
      user: { id: userId, tenantId, email: dto.email, displayName: dto.displayName },
    };
  }

  async login(dto: { email: string; password: string }) {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, dto.email))
      .limit(1);
    const user = rows[0];
    if (!user || !user.passwordHash) throw new UnauthorizedException('邮箱或密码错误');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('邮箱或密码错误');
    if (user.status !== 'active') throw new UnauthorizedException('账号不可用');

    return {
      ...this.issueTokens(user.id, user.tenantId),
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(refreshToken);
      if (payload.type !== 'refresh') throw new Error('类型错误');
      return this.issueTokens(payload.sub, payload.tenantId);
    } catch {
      throw new UnauthorizedException('无效或已过期的刷新令牌');
    }
  }

  async getMe(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user) throw new NotFoundException('用户不存在');
    return {
      id: user.id,
      tenantId: user.tenantId,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
    };
  }

  private issueTokens(userId: string, tenantId: string) {
    const accessTtl = Number(this.config.get<string>('JWT_EXPIRES_IN') ?? 3600);
    const refreshTtl = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? 2592000);
    const base = { sub: userId, tenantId };
    const accessToken = this.jwt.sign({ ...base, type: 'access' }, { expiresIn: accessTtl });
    const refreshToken = this.jwt.sign({ ...base, type: 'refresh' }, { expiresIn: refreshTtl });
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }
}
