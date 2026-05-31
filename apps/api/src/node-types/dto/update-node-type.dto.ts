import { IsInt, IsObject, IsOptional } from 'class-validator';

export class UpdateNodeTypeDto {
  @IsObject()
  definition!: Record<string, unknown>;

  /** 可选乐观锁：传入则须等于当前 version，否则 409。 */
  @IsOptional()
  @IsInt()
  version?: number;
}
