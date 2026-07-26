import { BadRequestException } from '@nestjs/common';

export class InsufficientStockException extends BadRequestException {
  constructor(productId: string) {
    super(`Insufficient stock available for product ${productId}.`);
  }
}
