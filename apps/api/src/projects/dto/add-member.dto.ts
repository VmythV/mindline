import { IsIn, IsString } from 'class-validator';
import { ROLES, type Role } from '@mindline/shared';

export class AddMemberDto {
  @IsString()
  userId!: string;

  @IsIn(ROLES as readonly string[])
  role!: Role;
}
