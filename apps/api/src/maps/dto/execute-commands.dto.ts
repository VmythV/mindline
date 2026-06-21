import { ArrayNotEmpty, IsArray } from 'class-validator';
import type { Command } from '@mindline/shared';

/**
 * POST /maps/:mapId/commands 请求体。commands 为命令层命令数组；
 * 元素的具体形态（可辨识联合）由 CollabWriterService 运行时按 kind 分派，
 * 非法 kind 在执行阶段拒绝。
 */
export class ExecuteCommandsDto {
  @IsArray()
  @ArrayNotEmpty()
  commands!: Command[];
}
