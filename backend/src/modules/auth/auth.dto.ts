// 인증 요청 DTO (class-validator)
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// POST /auth/join-code
export class JoinCodeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '가입 코드는 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '가입 코드를 입력해 주세요.' })
  @MaxLength(64, { message: '가입 코드가 너무 깁니다.' })
  code!: string;
}

// GET /auth/google/callback 쿼리 (Google이 전달하는 값)
export class GoogleCallbackQuery {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}
