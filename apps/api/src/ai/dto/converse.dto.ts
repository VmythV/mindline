import { IsString, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() content!: string;
}

export class ConverseDto {
  @IsString() mapId!: string;
  @IsString() nodeId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}
