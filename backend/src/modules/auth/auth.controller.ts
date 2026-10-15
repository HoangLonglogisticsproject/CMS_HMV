import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ErrorResponse } from '../../common/errors';
import {
  type AuthContext,
  CurrentUser,
  type Permission,
  Public,
} from './auth.decorators';
import { ChangePasswordDto, LoginDto, SessionResponse } from './auth.dto';
import { AuthService } from './auth.service';

const toSession = (auth: AuthContext): SessionResponse => ({
  user: {
    id: auth.userId,
    email: auth.email,
    displayName: auth.displayName,
    roles: auth.roles,
    permissions: [...auth.permissions].sort() as Permission[],
  },
  csrfToken: auth.csrfToken,
  expiresAt: auth.expiresAt,
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({
    type: SessionResponse,
    description: 'Sets the HttpOnly session cookie',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description: 'INVALID_CREDENTIALS',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponse,
    description: 'RATE_LIMITED (see Retry-After)',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { token, auth } = await this.auth.login(
      dto.email,
      dto.password,
      req.ip,
      req.header('user-agent'),
    );
    res.cookie(this.auth.cookieName, token, {
      ...this.auth.cookieOptions,
      expires: auth.expiresAt,
    });
    return toSession(auth);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth('session')
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth);
    res.clearCookie(this.auth.cookieName, this.auth.cookieOptions);
  }

  @Post('password')
  @HttpCode(204)
  @ApiCookieAuth('session')
  @ApiNoContentResponse({
    description:
      'Password changed; this session stays signed in, every other session of the user is revoked',
  })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'VALIDATION_FAILED (policy, or same as the current one)',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description: 'UNAUTHENTICATED',
  })
  @ApiForbiddenResponse({
    type: ErrorResponse,
    description:
      'CURRENT_PASSWORD_INCORRECT | CSRF_TOKEN_INVALID | ORIGIN_NOT_ALLOWED',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponse,
    description: 'RATE_LIMITED (see Retry-After)',
  })
  async changePassword(
    @CurrentUser() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(auth, dto.currentPassword, dto.newPassword);
  }

  @Get('session')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: SessionResponse })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description: 'UNAUTHENTICATED',
  })
  session(@CurrentUser() auth: AuthContext): SessionResponse {
    return toSession(auth);
  }
}
