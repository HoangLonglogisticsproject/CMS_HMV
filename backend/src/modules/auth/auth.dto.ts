import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PERMISSIONS, type Permission } from './auth.decorators';

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
