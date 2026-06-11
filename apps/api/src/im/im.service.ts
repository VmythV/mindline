import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { newId, type Role } from '@mindline/shared';
import { schema, type Database } from '@mindline/db';
import { DRIZZLE } from '../db/db.module';
import { hasMinRole } from '../common/roles';
import { encryptSecret, decryptSecret } from '../common/crypto';
import type { CreateChannelDto } from './dto/create-channel.dto';
import type { PublishDto } from './dto/publish.dto';

interface Ctx {
  userId: string;
  tenantId: string;
}

/** 渠道列表视图（不暴露加密 config 内的 webhookUrl）。 */
interface ChannelView {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  createdAt: number;
}

/** 从渠道查询结果提取安全展示字段。 */
function toChannelView(r: typeof schema.imChannels.$inferSelect): ChannelView {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: r.enabled,
    createdAt: r.createdAt.getTime(),
  };
}

/** 根据渠道类型与内容生成对应 IM 平台的请求体。 */
function buildPayload(type: string, title: string, body: string): unknown {
  switch (type) {
    case 'wecom':
      return {
        msgtype: 'markdown',
        markdown: { content: `${title}\n${body}` },
      };
    case 'dingtalk':
      return {
        msgtype: 'markdown',
        markdown: { title, text: body },
        at: { isAtAll: false },
      };
    case 'feishu':
      return {
        msg_type: 'interactive',
        card: {
          elements: [{ tag: 'markdown', content: body }],
        },
      };
    case 'slack':
      return {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: body } }],
      };
    default: // webhook
      return {
        type,
        content: body,
        timestamp: Date.now(),
      };
  }
}

@Injectable()
export class ImService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** 列出项目下的所有 IM 渠道（Viewer+，由调用方 ProjectRoleGuard 保证）。不回传 webhookUrl。 */
  async listChannels(projectId: string, tenantId: string): Promise<{ items: ChannelView[] }> {
    const rows = await this.db
      .select()
      .from(schema.imChannels)
      .where(
        and(
          eq(schema.imChannels.projectId, projectId),
          eq(schema.imChannels.tenantId, tenantId),
        ),
      );
    return { items: rows.map(toChannelView) };
  }

  /** 创建渠道（Admin+，由调用方 ProjectRoleGuard 保证）。加密 webhookUrl 后存入 config。 */
  async createChannel(
    projectId: string,
    ctx: Ctx,
    dto: CreateChannelDto,
  ): Promise<{ id: string; name: string }> {
    const id = newId('imChannel');
    const webhookUrlEnc = encryptSecret(dto.webhookUrl);
    await this.db.insert(schema.imChannels).values({
      id,
      tenantId: ctx.tenantId,
      projectId,
      name: dto.name,
      type: dto.type,
      config: { webhookUrlEnc } as Record<string, string>,
      enabled: true,
      createdBy: ctx.userId,
    });
    return { id, name: dto.name };
  }

  /**
   * 删除渠道（Admin+）。路由不含 projectId，在 service 内反查渠道所属项目并校验成员角色。
   */
  async deleteChannel(id: string, ctx: Ctx): Promise<void> {
    const rows = await this.db
      .select({
        projectId: schema.imChannels.projectId,
        tenantId: schema.imChannels.tenantId,
      })
      .from(schema.imChannels)
      .where(eq(schema.imChannels.id, id))
      .limit(1);

    const ch = rows[0];
    if (!ch || ch.tenantId !== ctx.tenantId) throw new NotFoundException('渠道不存在');

    await this.assertProjectRole(ch.projectId, ctx, 'admin');
    await this.db.delete(schema.imChannels).where(eq(schema.imChannels.id, id));
  }

  /**
   * 发布消息（Editor+）。路由不含 projectId，在 service 内反查渠道所属项目并校验成员角色。
   */
  async publish(ctx: Ctx, dto: PublishDto): Promise<{ ok: boolean; message: string }> {
    const rows = await this.db
      .select()
      .from(schema.imChannels)
      .where(eq(schema.imChannels.id, dto.channelId))
      .limit(1);

    const ch = rows[0];
    if (!ch || ch.tenantId !== ctx.tenantId) throw new NotFoundException('渠道不存在');
    if (!ch.enabled) throw new ForbiddenException('渠道已禁用');

    await this.assertProjectRole(ch.projectId, ctx, 'editor');

    const cfg = ch.config as Record<string, unknown>;
    const webhookUrlEnc = cfg['webhookUrlEnc'];
    if (typeof webhookUrlEnc !== 'string') {
      throw new InternalServerErrorException('渠道配置损坏：缺少 webhookUrlEnc');
    }

    let webhookUrl: string;
    try {
      webhookUrl = decryptSecret(webhookUrlEnc);
    } catch {
      throw new InternalServerErrorException('渠道 webhook 解密失败');
    }

    const body =
      dto.content?.trim() || `[思谱] ${dto.type}: ${dto.targetId}`;
    const title = `思谱通知 · ${dto.type}`;

    // webhook 类型的 payload 附上 targetId
    const payload =
      ch.type === 'webhook'
        ? { type: dto.type, targetId: dto.targetId, content: body, timestamp: Date.now() }
        : buildPayload(ch.type, title, body);

    let resp: Response;
    try {
      resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `发送失败：${msg}` };
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, message: `webhook 响应异常 ${resp.status}：${text.slice(0, 200)}` };
    }

    return { ok: true, message: '发送成功' };
  }

  /** 反查渠道所属项目的成员角色，不满足则抛出异常。 */
  private async assertProjectRole(
    projectId: string,
    ctx: Ctx,
    minRole: Role,
  ): Promise<void> {
    const memb = await this.db
      .select({ role: schema.projectMembers.role })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, ctx.userId),
        ),
      )
      .limit(1);

    const role = memb[0]?.role as Role | undefined;
    if (!role) throw new NotFoundException('项目不存在');
    if (!hasMinRole(role, minRole)) throw new ForbiddenException('权限不足');
  }
}
