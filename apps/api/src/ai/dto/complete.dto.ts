import { IsString } from 'class-validator';

export class CompleteDto {
  @IsString() mapId!: string;
  @IsString() nodeId!: string;
  @IsString() title!: string;
}
