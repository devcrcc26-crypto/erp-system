import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateLoginNameDto {
  @ApiProperty({
    description: 'OA login name exactly as the employee will type it',
    example: 'Abebe Bekele Kebede',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  loginName!: string;
}
