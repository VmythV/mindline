import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { newId } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { decryptSecret, encryptSecret, maskSecret } from '../common/crypto';
import type { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

/** ai_provider_configs.config 形态（apiKey 加密，apiKeyMask 为尾4位脱敏明文，非敏感）。 */
interface ProviderConfig {
  endpoint: string;
  model?: string;
  apiKeyEnc?: string;
  apiKeyMask?: string;
  capabilities?: Record<string, boolean>;
}

/** 网关路由用的解密后凭证。 */
export interface ResolvedProvider {
  provider: string;
  endpoint: string;
  model?: string;
  apiKey?: string;
}

@Injectable()
export class ProvidersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async getOwned(id: string, ctx: Ctx) {
    const rows = await this.db
      .select()
      .from(schema.aiProviderConfigs)
      .where(
        and(
          eq(schema.aiProviderConfigs.id, id),
          eq(schema.aiProviderConfigs.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException('凭证不存在');
    return row;
  }

  /** 租户内凭证列表（默认优先；apiKey 仅返回脱敏，不回明文）。 */
  async list(ctx: Ctx) {
    const rows = await this.db
      .select()
      .from(schema.aiProviderConfigs)
      .where(eq(schema.aiProviderConfigs.tenantId, ctx.tenantId))
      .orderBy(desc(schema.aiProviderConfigs.isDefault), desc(schema.aiProviderConfigs.createdAt));
    return {
      items: rows.map((r) => {
        const cfg = r.config as ProviderConfig;
        return {
          id: r.id,
          provider: r.provider,
          endpoint: cfg.endpoint,
          model: cfg.model ?? null,
          apiKeyMask: cfg.apiKeyMask ?? '',
          isDefault: r.isDefault,
          enabled: r.enabled,
          createdAt: r.createdAt.getTime(),
        };
      }),
    };
  }

  async create(ctx: Ctx, dto: CreateProviderDto) {
    const id = newId('aiProviderConfig');
    const config: ProviderConfig = {
      endpoint: dto.endpoint,
      model: dto.model,
      apiKeyEnc: dto.apiKey ? encryptSecret(dto.apiKey) : undefined,
      apiKeyMask: dto.apiKey ? maskSecret(dto.apiKey) : '',
    };
    // 该租户首条配置强制为默认；否则按 dto
    const existing = await this.db
      .select({ id: schema.aiProviderConfigs.id })
      .from(schema.aiProviderConfigs)
      .where(eq(schema.aiProviderConfigs.tenantId, ctx.tenantId))
      .limit(1);
    const isDefault = dto.isDefault ?? existing.length === 0;

    await this.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(schema.aiProviderConfigs)
          .set({ isDefault: false })
          .where(
            and(
              eq(schema.aiProviderConfigs.tenantId, ctx.tenantId),
              eq(schema.aiProviderConfigs.isDefault, true),
            ),
          );
      }
      await tx.insert(schema.aiProviderConfigs).values({
        id,
        tenantId: ctx.tenantId,
        provider: dto.provider,
        config,
        isDefault,
        enabled: dto.enabled ?? true,
      });
    });
    return { id, isDefault };
  }

  async update(ctx: Ctx, id: string, dto: UpdateProviderDto) {
    const row = await this.getOwned(id, ctx);
    const cfg: ProviderConfig = { ...(row.config as ProviderConfig) };
    if (dto.endpoint !== undefined) cfg.endpoint = dto.endpoint;
    if (dto.model !== undefined) cfg.model = dto.model;
    if (dto.apiKey) {
      cfg.apiKeyEnc = encryptSecret(dto.apiKey);
      cfg.apiKeyMask = maskSecret(dto.apiKey);
    }
    await this.db.transaction(async (tx) => {
      if (dto.isDefault) {
        await tx
          .update(schema.aiProviderConfigs)
          .set({ isDefault: false })
          .where(
            and(
              eq(schema.aiProviderConfigs.tenantId, ctx.tenantId),
              eq(schema.aiProviderConfigs.isDefault, true),
            ),
          );
      }
      await tx
        .update(schema.aiProviderConfigs)
        .set({
          config: cfg,
          ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        })
        .where(eq(schema.aiProviderConfigs.id, id));
    });
    return { id };
  }

  async remove(ctx: Ctx, id: string) {
    await this.getOwned(id, ctx);
    await this.db.delete(schema.aiProviderConfigs).where(eq(schema.aiProviderConfigs.id, id));
    return { id, deleted: true };
  }

  /** 供网关使用：取该租户启用的凭证（默认优先），解密 apiKey。无则返回 null（回退 env/stub）。 */
  async getActiveConfig(tenantId: string): Promise<ResolvedProvider | null> {
    const rows = await this.db
      .select()
      .from(schema.aiProviderConfigs)
      .where(
        and(
          eq(schema.aiProviderConfigs.tenantId, tenantId),
          eq(schema.aiProviderConfigs.enabled, true),
        ),
      )
      .orderBy(desc(schema.aiProviderConfigs.isDefault), desc(schema.aiProviderConfigs.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const cfg = row.config as ProviderConfig;
    return {
      provider: row.provider,
      endpoint: cfg.endpoint,
      model: cfg.model,
      apiKey: cfg.apiKeyEnc ? decryptSecret(cfg.apiKeyEnc) : undefined,
    };
  }

  /** 租户用量聚合（按 provider+model）。 */
  async usage(ctx: Ctx, opts: { from?: number; to?: number } = {}) {
    const conds = [eq(schema.aiUsage.tenantId, ctx.tenantId)];
    if (opts.from) conds.push(gte(schema.aiUsage.ts, new Date(opts.from)));
    if (opts.to) conds.push(lte(schema.aiUsage.ts, new Date(opts.to)));
    const rows = await this.db
      .select({
        provider: schema.aiUsage.provider,
        model: schema.aiUsage.model,
        calls: sql<number>`count(*)::int`,
        tokensIn: sql<number>`coalesce(sum(${schema.aiUsage.tokensIn}),0)::int`,
        tokensOut: sql<number>`coalesce(sum(${schema.aiUsage.tokensOut}),0)::int`,
      })
      .from(schema.aiUsage)
      .where(and(...conds))
      .groupBy(schema.aiUsage.provider, schema.aiUsage.model);
    const totals = rows.reduce(
      (a, r) => ({
        calls: a.calls + r.calls,
        tokensIn: a.tokensIn + r.tokensIn,
        tokensOut: a.tokensOut + r.tokensOut,
      }),
      { calls: 0, tokensIn: 0, tokensOut: 0 },
    );
    return { items: rows, totals };
  }

  /** 记录一次调用用量（计量失败不应阻断主流程，由调用方 try/catch）。 */
  async record(params: {
    tenantId: string;
    projectId?: string | null;
    userId: string;
    capability: string;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
  }) {
    await this.db.insert(schema.aiUsage).values({
      id: newId('aiUsage'),
      tenantId: params.tenantId,
      projectId: params.projectId ?? null,
      userId: params.userId,
      capability: params.capability,
      provider: params.provider,
      model: params.model,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
    });
  }
}
