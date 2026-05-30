import { IsIn } from 'class-validator';
import { ROLES, type Role } from '@mindline/shared';

export class UpdateMemberDto {
  @IsIn(ROLES as readonly string[])
  role!: Role;
}
