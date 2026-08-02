import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'A human-readable label to identify this key later.',
    example: 'CI pipeline',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
