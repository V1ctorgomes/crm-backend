import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
      return;
    }

    this.logger.error('Erro não tratado', exception instanceof Error ? exception.stack : exception);

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor.'
        : exception instanceof Error
          ? exception.message
          : 'Erro interno do servidor.';

    res.status(status).json({ statusCode: status, message });
  }
}
