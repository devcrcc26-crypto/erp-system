import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePmModuleEnabledDto {
  @ApiProperty({ description: 'Enable or disable the project-management module' })
  @IsBoolean()
  enabled!: boolean;
}
