import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ description: 'The external URL to POST event payloads to.' })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({
    description: 'Event types to subscribe to.',
    example: ['OrderCreated'],
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  eventTypes!: string[];
}
