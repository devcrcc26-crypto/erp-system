import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluationScoreDto {
  @ApiProperty()
  @IsUUID()
  criteriaId!: string;

  @ApiPropertyOptional({ description: '1-5 or null for N/A' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  score?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class SubmitAssessmentDto {
  @ApiProperty({ type: [EvaluationScoreDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreDto)
  scores!: EvaluationScoreDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class DisputeEvaluationDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class DLRespondToDisputeDto {
  @ApiProperty({ enum: ['UPHELD', 'ADJUSTED'] })
  @IsIn(['UPHELD', 'ADJUSTED'])
  decision!: 'UPHELD' | 'ADJUSTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  adjustedScore?: number;

  @ApiProperty()
  @IsString()
  comment!: string;
}

export class EmployeeRespondToDLDto {
  @ApiProperty({ enum: ['ACCEPTED', 'ESCALATED'] })
  @IsIn(['ACCEPTED', 'ESCALATED'])
  decision!: 'ACCEPTED' | 'ESCALATED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  escalationReason?: string;
}

export class HRDecideDisputeDto {
  @ApiProperty({ enum: ['UPHELD', 'ADJUSTED'] })
  @IsIn(['UPHELD', 'ADJUSTED'])
  decision!: 'UPHELD' | 'ADJUSTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  adjustedScore?: number;

  @ApiProperty()
  @IsString()
  comment!: string;
}

export class CreateEmployeeEvaluationDto {
  @ApiProperty()
  @IsUUID()
  cycleId!: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamLeadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractId?: string;
}
