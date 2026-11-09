import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { ArchiveRepository } from './archive.repository';

@Module({
  controllers: [ArchiveController],
  providers: [ArchiveService, ArchiveRepository],
})
export class ArchiveModule {}