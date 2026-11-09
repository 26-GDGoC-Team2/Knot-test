import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { ActivityService } from './activity.service';
import { CommonResponse } from '../../common/common-response';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('me')
  async getMyActivity(@Req() req: Request) {
    const data = await this.activityService.getMyActivity((req.user as any).id);
    return CommonResponse.ok(data);
  }

  @Get('users/:userId/graduation')
  async getGraduationStatus(@Param('userId') userId: string) {
    const data = await this.activityService.getGraduationStatus(userId);
    return CommonResponse.ok(data);
  }

  @Post('me/records')
  async addRecord(
    @Req() req: Request,
    @Body('activityType') activityType: string,
    @Body('activityName') activityName: string,
    @Body('participatedAt') participatedAt: string,
  ) {
    await this.activityService.addRecord(
      (req.user as any).id,
      activityType,
      activityName,
      new Date(participatedAt),
    );
    return CommonResponse.ok(null);
  }
}