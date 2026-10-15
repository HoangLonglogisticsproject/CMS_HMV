import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PERMISSIONS, type Permission } from './auth.decorators';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  /** 12..1024 characters, no leading/trailing whitespace, different from the current one. */
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password: string;
}

export class SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  @ApiProperty({ enum: PERMISSIONS, enumName: 'Permission', isArray: true })
  permissions: Permission[];
}

export class SessionResponse {
  user: SessionUser;
  /** Send back as the `X-CSRF-Token` header on every POST/PUT/PATCH/DELETE. */
  csrfToken: string;
  expiresAt: Date;
}
