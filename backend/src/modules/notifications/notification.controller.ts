import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NotificationService } from './notification.service';
import { SubscribePushDto, UpdateNotificationSettingsDto } from './notification.dto';
import { CommonResponse } from '../../common/common-response';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // 푸시 구독 등록
  @Post('push')
  async subscribePush(@Req() req: Request, @Body() dto: SubscribePushDto) {
    const userId = (req.user as any).id;
    const result = await this.notificationService.subscribePush(userId, dto);
    return CommonResponse.ok(result);
  }

  // 푸시 구독 해지
  @Delete('push')
  async unsubscribePush(@Req() req: Request, @Body('endpoint') endpoint: string) {
    const userId = (req.user as any).id;
    const result = await this.notificationService.unsubscribePush(userId, endpoint);
    return CommonResponse.ok(result);
  }

  // 알림 설정 조회
  @Get('settings')
  async getSettings(@Req() req: Request) {
    const userId = (req.user as any).id;
    const result = await this.notificationService.getSettings(userId);
    return CommonResponse.ok(result);
  }

  // 알림 설정 수정
  @Patch('settings')
  async updateSettings(@Req() req: Request, @Body() dto: UpdateNotificationSettingsDto) {
    const userId = (req.user as any).id;
    const result = await this.notificationService.updateSettings(userId, dto);
    return CommonResponse.ok(result);
  }

  // 알림 목록 조회
  @Get()
  async getNotifications(@Req() req: Request) {
    const userId = (req.user as any).id;
    const result = await this.notificationService.getNotifications(userId);
    return CommonResponse.ok(result);
  }

  // 알림 읽음 처리
  @Patch(':notificationId/read')
  async markAsRead(@Req() req: Request, @Param('notificationId') notificationId: string) {
    const userId = (req.user as any).id;
    const result = await this.notificationService.markAsRead(notificationId, userId);
    return CommonResponse.ok(result);
  }  // 알림 단건 삭제
  @Delete(':notificationId')
  async deleteNotification(
    @Param('notificationId') notificationId: string,
    @Req() req: Request
  ) {
    await this.notificationService.deleteNotification(notificationId, (req.user as any).id);
    return CommonResponse.ok(null);
  }

  // 알림 전체 삭제
  @Delete()
  async deleteAllNotifications(@Req() req: Request) {
    await this.notificationService.deleteAllNotifications((req.user as any).id);
    return CommonResponse.ok(null);
  }
    // 알림 전체 읽음 처리
  @Patch('read')
  async markAllAsRead(@Req() req: Request) {
    await this.notificationService.markAllAsRead((req.user as any).id);
    return CommonResponse.ok(null);
  }
}