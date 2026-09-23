import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AttendanceMatchingService } from './application/services/attendance-matching.service';

/**
 * Attendance import module shell.
 * Controller and import persistence are added in a later chunk.
 */
@Module({
  imports: [PrismaModule],
  providers: [AttendanceMatchingService],
  exports: [AttendanceMatchingService],
})
export class AttendanceModule {}
