import { IsBoolean, IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

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

// 수료 여부 지정 (true/false 만 허용)
export class SetGraduationDto {
  @IsBoolean({ message: '수료 여부는 true 또는 false 여야 해요' })
  isGraduated!: boolean;
}

export class ForceWithdrawDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}