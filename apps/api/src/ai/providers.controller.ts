import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ProvidersService } from './providers.service';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';

/**
 * AI 凭证管理（租户级）。
 * 鉴权（M2.1 简化）：全局 JwtGuard + 按 tenantId scope —— 同租户登录用户即可管理。
 * 风险：租户级 admin 角色体系尚未建立，后续随租户 RBAC 收紧（仅租户管理员可改密钥）。
 */
@Controller()
export class ProvidersController {
  constructor(private readonly svc: ProvidersService) {}

  @Get('ai/providers')
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post('ai/providers')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProviderDto) {
    return this.svc.create(user, dto);
  }

  @Patch('ai/providers/:id')
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateProviderDto) {
    return this.svc.update(user, id, dto);
  }

  @Delete('ai/providers/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.remove(user, id);
  }

  @Get('ai/usage')
  usage(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.usage(user, {
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
    });
  }
}
