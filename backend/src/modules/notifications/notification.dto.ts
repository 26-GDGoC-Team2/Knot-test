import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SubscribePushDto {
  @IsString()
  endpoint!: string;

  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  @IsOptional()
  pushEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  recruitmentNoti?: boolean;

  @IsBoolean()
  @IsOptional()
  applicationNoti?: boolean;

  @IsBoolean()
  @IsOptional()
  systemNoti?: boolean;

  @IsString()
  @IsOptional()
  recruitmentRange?: string;
}