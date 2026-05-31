import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProviderDto {
  @IsString()
  provider!: string; // openai/qwen/deepseek/vllm...

  @IsString()
  endpoint!: string; // OpenAI 兼容 base url（不含 /chat/completions）

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string; // 明文传入，服务端加密存储

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateProviderDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string; // 仅当需要更换密钥时传入

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
