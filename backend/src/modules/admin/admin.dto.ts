import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

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

  // 수료 기수 (한 사람당 한 기수, 운영진만 지정). 생략하면 기존 값 유지, null 이면 지움
  @IsOptional()
  @IsInt({ message: '수료 기수는 정수여야 해요' })
  @Min(1, { message: '수료 기수는 1 이상이어야 해요' })
  @Max(999, { message: '수료 기수가 너무 커요' })
  graduationCohort?: number | null;
}

export class ForceWithdrawDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}