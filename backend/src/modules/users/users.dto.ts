import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PERMISSIONS, type Permission } from '../auth/auth.decorators';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth/password';

const ROLE_CODE = /^[A-Z][A-Z_]{1,31}$/;

/** Never carries a password hash or session token. */
export class AdminUserResponse {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roles: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Sessions that are neither revoked nor expired. */
  activeSessions: number;
}

export class UserListResponse {
  items: AdminUserResponse[];
}

export class RoleResponse {
  code: string;
  name: string;
  description: string | null;
  @ApiProperty({ enum: PERMISSIONS, enumName: 'Permission', isArray: true })
  permissions: Permission[];
}

export class RoleListResponse {
  items: RoleResponse[];
}

export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName: string;

  /** Role codes from GET /admin/roles. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Matches(ROLE_CODE, { each: true })
  roles: string[];

  /** Initial password set by the administrator and handed over out of band; the user changes it after signing in. */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

/** Only the fields that are present change. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Matches(ROLE_CODE, { each: true })
  roles?: string[];

  /** false signs the user out everywhere and blocks sign-in; true restores access. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminSetPasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class RevokeSessionsResponse {
  revoked: number;
}

export class SecurityEventsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 100;
}

/** An `auth.*` or `user.*` audit row. Metadata never holds passwords, hashes or tokens. */
export class SecurityEventResponse {
  id: string;
  action: string;
  createdAt: Date;
  /** Who did it; null for the CLI and for failed sign-ins of unknown accounts. */
  actorEmail: string | null;
  /** The account it concerns, when it is a user. */
  targetEmail: string | null;
  ipAddress: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  metadata: Record<string, unknown> | null;
}

export class SecurityEventListResponse {
  items: SecurityEventResponse[];
}
