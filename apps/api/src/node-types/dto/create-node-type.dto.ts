import { IsObject, IsString, Matches } from 'class-validator';

export class CreateNodeTypeDto {
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: 'typeKey 仅允许字母开头的字母/数字/下划线',
  })
  typeKey!: string;

  @IsObject()
  definition!: Record<string, unknown>;
}
