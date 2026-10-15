import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors';

export const PERMISSIONS = [
  'article:read',
  'article:write',
  'article:review',
  'article:publish',
  'article:archive',
  'media:read',
  'media:write',
  'user:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface AuthContext {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: Set<string>;
  sessionId: string;
  csrfToken: string;
  expiresAt: Date;
  ip?: string;
}

export const IS_PUBLIC = 'auth:public';
export const REQUIRED_PERMISSIONS = 'auth:permissions';

/** Opts a route out of authentication. Every other route requires a valid session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Requires a session holding ALL listed permissions. Unsafe methods also require the CSRF header. */
export const RequirePermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, permissions),
    ApiCookieAuth('session'), // createOpenApiDocument adds the CSRF requirement to write operations
    ApiBadRequestResponse({
      type: ErrorResponse,
      description: 'VALIDATION_FAILED',
    }),
    ApiUnauthorizedResponse({
      type: ErrorResponse,
      description: 'UNAUTHENTICATED',
    }),
    ApiForbiddenResponse({
      type: ErrorResponse,
      description:
        'PERMISSION_DENIED | CSRF_TOKEN_INVALID | ORIGIN_NOT_ALLOWED',
    }),
  );

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest().auth,
);
