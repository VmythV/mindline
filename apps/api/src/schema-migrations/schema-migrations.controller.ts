/**
 * Schema 迁移控制器 —— Schema迁移工具详设 §11。
 *
 * 路由：
 *   POST /schemas/:typeKey/migrations/preview
 *   POST /schemas/:typeKey/migrations/execute  （202 异步同步）
 *   GET  /schemas/migrations/:migrationId
 *   POST /schemas/migrations/:migrationId/rollback
 *
 * 鉴权：全局 JwtAuthGuard（已注入 ctx.user）；admin 校验在 service 内部完成
 * （路由不含 projectId，无法使用 ProjectRoleGuard，遵循约定④）。
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { SchemaMigrationsService } from './schema-migrations.service';
import { MigrationPreviewDto } from './dto/migration-preview.dto';
import { MigrationExecuteDto } from './dto/migration-execute.dto';

@Controller('schemas')
export class SchemaMigrationsController {
  constructor(private readonly svc: SchemaMigrationsService) {}

  /**
   * POST /api/schemas/:typeKey/migrations/preview
   * 预览迁移效果（dry-run，不写库）。
   * 返回受影响节点数、逐算子统计、抽样 diff、issues。
   */
  @Post(':typeKey/migrations/preview')
  preview(
    @Param('typeKey') typeKey: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MigrationPreviewDto,
  ) {
    return this.svc.preview(typeKey, user.tenantId, dto);
  }

  /**
   * POST /api/schemas/:typeKey/migrations/execute
   * 执行迁移（同步完成，202 响应）。
   * 返回 { migrationId, status }。
   * admin 权限在 service 层逐项目校验。
   */
  @Post(':typeKey/migrations/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  execute(
    @Param('typeKey') typeKey: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MigrationExecuteDto,
  ) {
    return this.svc.execute(typeKey, user.tenantId, user, dto);
  }

  /**
   * GET /api/schemas/migrations/:migrationId
   * 查询迁移任务进度与结果。
   */
  @Get('migrations/:migrationId')
  getStatus(
    @Param('migrationId') migrationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.getStatus(migrationId, user.tenantId);
  }

  /**
   * POST /api/schemas/migrations/:migrationId/rollback
   * 事件逆放回滚（限时窗口内，默认 7 天）。
   * 返回 { migrationId, status, mode }（202）。
   */
  @Post('migrations/:migrationId/rollback')
  @HttpCode(HttpStatus.ACCEPTED)
  rollback(
    @Param('migrationId') migrationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.rollback(migrationId, user.tenantId, user);
  }
}
