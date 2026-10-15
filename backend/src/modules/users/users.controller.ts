import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors';
import {
  type AuthContext,
  CurrentUser,
  RequirePermissions,
} from '../auth/auth.decorators';
import {
  AdminSetPasswordDto,
  AdminUserResponse,
  CreateUserDto,
  RevokeSessionsResponse,
  RoleListResponse,
  SecurityEventListResponse,
  SecurityEventsQuery,
  UpdateUserDto,
  UserListResponse,
} from './users.dto';
import { UsersService } from './users.service';

const actor = (auth: AuthContext) => ({ userId: auth.userId, ip: auth.ip });

/** Account administration. Every route requires `user:manage` (ADMIN), checked server-side by the global guard. */
@ApiTags('Admin · Users')
@Controller('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions('user:manage')
  @ApiOkResponse({ type: UserListResponse })
  list(): Promise<UserListResponse> {
    return this.users.list();
  }

  @Get('roles')
  @RequirePermissions('user:manage')
  @ApiOkResponse({ type: RoleListResponse })
  roles(): Promise<RoleListResponse> {
    return this.users.roles();
  }

  @Post('users')
  @RequirePermissions('user:manage')
  @ApiCreatedResponse({ type: AdminUserResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'EMAIL_TAKEN' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<AdminUserResponse> {
    return this.users.create(dto, actor(auth));
  }

  @Patch('users/:id')
  @RequirePermissions('user:manage')
  @ApiOkResponse({ type: AdminUserResponse })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({
    type: ErrorResponse,
    description:
      'LAST_ADMIN: the change would leave no active user with user:manage',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<AdminUserResponse> {
    return this.users.update(id, dto, actor(auth));
  }

  @Post('users/:id/password')
  @HttpCode(204)
  @RequirePermissions('user:manage')
  @ApiNoContentResponse({
    description: 'New password set; every session of that user is revoked',
  })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'USER_NOT_FOUND' })
  async setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminSetPasswordDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<void> {
    await this.users.setPassword(id, dto.newPassword, actor(auth));
  }

  @Post('users/:id/sessions/revoke')
  @HttpCode(200)
  @RequirePermissions('user:manage')
  @ApiOkResponse({ type: RevokeSessionsResponse })
  @ApiNotFoundResponse({ type: ErrorResponse, description: 'USER_NOT_FOUND' })
  async revokeSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() auth: AuthContext,
  ): Promise<RevokeSessionsResponse> {
    return { revoked: await this.users.revokeSessions(id, actor(auth)) };
  }

  @Get('security-events')
  @RequirePermissions('user:manage')
  @ApiOkResponse({ type: SecurityEventListResponse })
  securityEvents(
    @Query() query: SecurityEventsQuery,
  ): Promise<SecurityEventListResponse> {
    return this.users.securityEvents(query.limit);
  }
}
