import { IsString } from 'class-validator';

export class RewriteDto {
  @IsString() mapId!: string;
  @IsString() nodeId!: string;
  @IsString() prompt!: string;
}
