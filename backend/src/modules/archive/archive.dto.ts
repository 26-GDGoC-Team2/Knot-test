import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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

  @IsArray()
  @IsString({ each: true })
  techStacks: string[] = [];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveMemberDto)
  members: ArchiveMemberDto[] = [];
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
  @IsArray()
  @IsString({ each: true })
  techStacks?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArchiveMemberDto)
  members?: ArchiveMemberDto[];
}
