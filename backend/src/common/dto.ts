import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  pageSize: number = 20;
}

export class PageMeta {
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty() total: number;
}

export const pageArgs = (q: PageQuery) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});

export class UserRef {
  @ApiProperty() id: string;
  @ApiProperty() displayName: string;
}

/** BCP 47-ish locale code as stored in the `locales` table ("vi", "en", "zh-Hans"). */
export const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
