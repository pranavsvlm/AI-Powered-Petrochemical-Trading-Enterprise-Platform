import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@platform/database';
import { ChannelNotAvailableError } from '@platform/notifications';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/** Maps every thrown error to a stable JSON shape and the correct HTTP status. Never leaks stack traces. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        message = (body as { message?: string | string[] }).message ?? exception.message;
      }
      error = HttpStatus[status] ?? 'Error';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        error = 'Conflict';
        message = 'A record with the same unique value already exists.';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        error = 'Not Found';
        message = 'The requested record was not found.';
      } else {
        status = HttpStatus.BAD_REQUEST;
        error = 'Bad Request';
        message = 'The request could not be processed.';
      }
    } else if (exception instanceof ChannelNotAvailableError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = exception.message;
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(`${request.url} -> ${status}`, (exception as Error)?.stack);
    } else {
      this.logger.warn(`${request.url} -> ${status}: ${JSON.stringify(message)}`);
    }

    response.status(status).json(body);
  }
}
