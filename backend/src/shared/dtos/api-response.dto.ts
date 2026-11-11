import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMeta } from './pagination-query.dto';

export class ApiSuccessResponseDto<T> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  data!: T;

  @ApiPropertyOptional()
  meta?: PaginationMeta;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 'UNAUTHORIZED' })
  code!: string;

  @ApiProperty({ example: 'Invalid credentials' })
  message!: string;

  @ApiPropertyOptional()
  details?: unknown;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;
}
