import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationError,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Stable, machine-readable error codes. Clients branch on `code`, never on `message`. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'PERMISSION_DENIED',
  'CSRF_TOKEN_INVALID',
  'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED',
  'NOT_FOUND',
  'ARTICLE_NOT_FOUND',
  'PAGE_NOT_FOUND',
  'TRANSLATION_NOT_FOUND',
  'MEDIA_NOT_FOUND',
  'CONFLICT',
  'REVISION_CONFLICT',
  'SLUG_TAKEN',
  'ARTICLE_ARCHIVED',
  'ARTICLE_NOT_ARCHIVED',
  'TRANSLATION_NOT_APPROVED',
  'TRANSLATION_NOT_SUBMITTED',
  'TRANSLATION_INCOMPLETE',
  'RICH_CONTENT_INVALID',
  'UNKNOWN_LOCALE',
  'UNKNOWN_CATEGORY',
  'REFERENCE_INVALID',
  'FILE_REQUIRED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  'CURRENT_PASSWORD_INCORRECT',
  'USER_NOT_FOUND',
  'EMAIL_TAKEN',
  'UNKNOWN_ROLE',
  'LAST_ADMIN',
  'INTEGRATION_DISABLED',
  'SIGNATURE_INVALID',
  'INQUIRY_NOT_FOUND',
  'ASSIGNEE_INVALID',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ErrorResponse {
  @ApiProperty({ example: 409 })
  statusCode: number;
  @ApiProperty({ enum: ERROR_CODES, enumName: 'ErrorCode' })
  code: ErrorCode;
  @ApiProperty()
  message: string;
  @ApiProperty({
    required: false,
    description:
      'Code-specific detail, e.g. [{ path, message }] for validation errors',
  })
  details?: unknown;
}

export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export interface Issue {
  path: string;
  message: string;
}

/** ValidationPipe exceptionFactory: flattens nested class-validator errors into `[{ path, message }]`. */
export function validationError(errors: ValidationError[]): AppError {
  const issues: Issue[] = [];
  const walk = (list: ValidationError[], prefix: string) => {
    for (const e of list) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      for (const message of Object.values(e.constraints ?? {}))
        issues.push({ path, message });
      walk(e.children ?? [], path);
    }
  };
  walk(errors, '');
  return new AppError(
    400,
    'VALIDATION_FAILED',
    'Request validation failed',
    issues,
  );
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

function toBody(err: unknown): ErrorResponse {
  if (err instanceof AppError) {
    return {
      statusCode: err.getStatus(),
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    return {
      statusCode: status,
      code: CODE_BY_STATUS[status] ?? 'BAD_REQUEST',
      message: err.message,
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002')
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Unique constraint violated',
      };
    if (err.code === 'P2003')
      return {
        statusCode: 422,
        code: 'REFERENCE_INVALID',
        message: 'Referenced record does not exist',
      };
    if (err.code === 'P2025')
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Record not found',
      };
  }
  // body-parser / multer errors carry an HTTP status (e.g. malformed JSON → 400, body too large → 413).
  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return {
      statusCode: status,
      code: CODE_BY_STATUS[status] ?? 'BAD_REQUEST',
      message: (err as Error).message,
    };
  }
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  };
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const body = toBody(err);
    if (body.statusCode >= 500)
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    const res = host.switchToHttp().getResponse<Response>();
    const retryAfter =
      err instanceof AppError &&
      (err.details as { retryAfterSeconds?: number })?.retryAfterSeconds;
    if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    res.status(body.statusCode).json(body);
  }
}
