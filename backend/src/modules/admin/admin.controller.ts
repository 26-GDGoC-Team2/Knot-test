import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { ChangeRoleDto, ForceWithdrawDto } from './admin.dto';
import { Roles, RolesGuard } from '../../common/role-guard';
import { CommonResponse } from '../../common/common-response';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('members')
  async getMembers() {
    const members = await this.adminService.getMembers();
    return CommonResponse.ok({ members });
  }

  @Patch('members/:userId/role')
  async changeRole(
    @Param('userId') userId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: Request,
  ) {
    const actorId = (req.user as any).id;
    await this.adminService.changeRole(userId, dto, actorId);
    return CommonResponse.ok(null);
  }

  @Delete('members/:userId')
  async forceWithdraw(
    @Param('userId') userId: string,
    @Body() dto: ForceWithdrawDto,
    @Req() req: Request,
  ) {
    const actorId = (req.user as any).id;
    await this.adminService.forceWithdraw(userId, dto, actorId);
    return CommonResponse.ok(null);
  }

  @Patch('members/:userId/graduation')
  async setGraduationStatus(
    @Param('userId') targetUserId: string,
    @Body('isGraduated') isGraduated: boolean,
    @Req() req: Request,
  ) {
    await this.adminService.setGraduationStatus(
      targetUserId,
      isGraduated,
      (req.user as any).id,
    );
    return CommonResponse.ok(null);
  }

  @Get('join-code')
  async getJoinCode() {
    const joinCode = await this.adminService.getJoinCode();
    return CommonResponse.ok({ joinCode });
  }

  @Post('join-code')
  async generateJoinCode(@Req() req: Request) {
    const result = await this.adminService.generateJoinCode(
      (req.user as any).id,
    );
    return CommonResponse.ok(result);
  }
}