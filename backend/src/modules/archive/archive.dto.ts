import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ArchiveMemberDto {
  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsString()
  @IsNotEmpty({ message: '멤버 이름을 입력해 주세요' })
  @MaxLength(50)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: '멤버 역할을 입력해 주세요' })
  @MaxLength(100)
  role!: string;
}

export class ArchiveLinkDto {
  @IsString()
  @IsNotEmpty({ message: '링크 이름을 입력해 주세요' })
  @MaxLength(50)
  label!: string;  // 'GitHub', '배포 사이트', '발표 자료' 등

  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'https 링크만 입력할 수 있어요' })
  @MaxLength(500)
  url!: string;
}

export class CreateArchiveDto {
  @IsString()
  @IsNotEmpty({ message: '프로젝트 제목을 입력해 주세요' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  cohort?: number | null;

  // 'YYYY-MM' 형식 (연·월만 선택)
  @IsOptional()
  @IsString()
  @MaxLength(7)
  startedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  endedAt?: string | null;

  @IsArray()
  @IsString({ each: true })
  techStacks: string[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveMemberDto)
  members: ArchiveMemberDto[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveLinkDto)
  links: ArchiveLinkDto[] = [];
}

export class UpdateArchiveDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '프로젝트 제목을 입력해 주세요' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  cohort?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  startedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  endedAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  techStacks?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveMemberDto)
  members?: ArchiveMemberDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveLinkDto)
  links?: ArchiveLinkDto[];
}
