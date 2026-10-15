import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/errors';
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from './auth.decorators';
import { AuthService, safeEqual } from './auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Global guard: default-deny. Routes must be @Public() or carry a valid session (+ CSRF token for writes). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: unknown }>();
    const unsafe = !SAFE_METHODS.has(req.method);
    if (unsafe) this.auth.assertAllowedOrigin(req);

    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;

    const auth = await this.auth.authenticate(req);
    if (unsafe && !safeEqual(req.header('x-csrf-token'), auth.csrfToken)) {
      throw new AppError(
        403,
        'CSRF_TOKEN_INVALID',
        'Missing or invalid X-CSRF-Token header',
      );
    }
    const required =
      this.reflector.getAllAndOverride<string[]>(
        REQUIRED_PERMISSIONS,
        targets,
      ) ?? [];
    const missing = required.filter((p) => !auth.permissions.has(p));
    if (missing.length)
      throw new AppError(403, 'PERMISSION_DENIED', 'Missing permission', {
        missing,
      });

    req.auth = auth;
    return true;
  }
}
