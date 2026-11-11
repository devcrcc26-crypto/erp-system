import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class DayCoverageQueryDto {
  @ApiProperty({ description: 'Employee whose coverage to inspect' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-10-01', description: 'Range start (inclusive)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-10-31', description: 'Range end (inclusive)' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({
    description:
      'Optional focus module — returned first when present (LEAVE, SITE_ASSIGNMENT, WORK_FROM_HOME, FIELD_MOVEMENT)',
  })
  @IsOptional()
  focus?: string;
}
