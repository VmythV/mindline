import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorCode } from '@mindline/shared';

interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  502: 'UPSTREAM_ERROR',
  504: 'TIMEOUT',
};

/** 统一错误响应（对齐 API契约总览 §1.3/§1.4）：{ error: { code, message, details? } } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<JsonResponse>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        if (Array.isArray(obj.message)) {
          message = (obj.message as string[]).join('; ');
          details = { fields: obj.message };
        } else if (obj.message != null) {
          message = String(obj.message);
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const code: ErrorCode = STATUS_TO_CODE[status] ?? 'INTERNAL';
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
  }
}
