import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export enum UserRole {
  MEMBER = 'MEMBER',
  ADMIN = 'ADMIN',
}

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  reason!: string;
}

export class GenerateJoinCodeDto {
  @IsString()
  @MinLength(1)
  label!: string;
}

export class ForceWithdrawDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}