import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultTimezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultDateFormat?: string;
}

export class CreateCompanySettingDto {
  @ApiProperty()
  @IsString()
  module!: string;

  @ApiProperty()
  @IsString()
  key!: string;

  @ApiProperty()
  @IsString()
  value!: string;

  @ApiPropertyOptional({ enum: ['STRING', 'NUMBER', 'BOOLEAN', 'JSON'] })
  @IsOptional()
  @IsIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON'])
  dataType?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateCompanySettingDto extends PartialType(CreateCompanySettingDto) {}

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHeadOffice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class CreateDivisionDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDivisionDto extends PartialType(CreateDivisionDto) {}

export class CreateDepartmentDto {
  @ApiPropertyOptional({
    description:
      'Optional - defaults to the company primary division when omitted.',
  })
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiPropertyOptional({
    description: 'Optional - defaults to the company primary branch when omitted.',
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameZh?: string;

  @ApiPropertyOptional({
    description:
      'Ignored on create. Assigned automatically as DEPT-0001, DEPT-0002, …',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  leaderUserId?: string | null;

  @ApiPropertyOptional({
    description:
      'When true, sets the leader user departmentId to this department if mismatched.',
  })
  @IsOptional()
  @IsBoolean()
  forceAlignLeaderDepartment?: boolean;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class CreateCostCentreDto {
  @ApiProperty()
  @IsString()
  departmentId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional({ enum: ['DIRECT', 'INDIRECT', 'OVERHEAD'] })
  @IsOptional()
  @IsEnum(['DIRECT', 'INDIRECT', 'OVERHEAD'])
  type?: 'DIRECT' | 'INDIRECT' | 'OVERHEAD';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCostCentreDto extends PartialType(CreateCostCentreDto) {}

export class CreatePositionDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Chinese title / name' })
  @IsOptional()
  @IsString()
  titleZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

export class CreateSeniorityLevelDto {
  @ApiProperty({ example: 'Senior', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Chinese name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameZh?: string;

  @ApiPropertyOptional({ description: 'Display order, lowest first', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSeniorityLevelDto extends PartialType(CreateSeniorityLevelDto) {}

export class CreateFinancialYearDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ enum: ['OPEN', 'CLOSED'] })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
}

export class UpdateFinancialYearDto extends PartialType(CreateFinancialYearDto) {}

export class CreateNumberSeriesDto {
  @ApiProperty()
  @IsString()
  documentType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suffix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  padding?: number;

  @ApiPropertyOptional({ enum: ['NEVER', 'YEARLY', 'MONTHLY'] })
  @IsOptional()
  @IsIn(['NEVER', 'YEARLY', 'MONTHLY'])
  resetFrequency?: 'NEVER' | 'YEARLY' | 'MONTHLY';
}

export class UpdateNumberSeriesDto extends PartialType(CreateNumberSeriesDto) {}

export class CreateDisciplineDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Optional discipline leader (Tier 1 leave approver)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  leaderId?: string | null;
}

export class UpdateDisciplineDto extends PartialType(CreateDisciplineDto) {}

export class AssignDisciplineLeaderDto {
  @ApiProperty({ description: 'User id of the discipline leader' })
  @IsString()
  @IsNotEmpty()
  leaderId!: string;
}

/** Query params for department / position lists. */
export class OrgEntityListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by isActive. Pass "true" or "false".',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}

/** Query params for engineering discipline catalog (allows full catalog in one page). */
export class ListEngineeringDisciplinesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'When "true", return only active disciplines' })
  @IsOptional()
  @IsString()
  activeOnly?: string;

  @ApiPropertyOptional({ default: 100, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  declare limit: number;
}
