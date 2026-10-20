import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppError, ErrorResponse } from '../../common/errors';
import { Public } from '../auth/auth.decorators';
import { PublicLocaleQuery } from '../articles/article.dto';
import { PAGE_KEY_RE, PublicPage } from './page.dto';
import { PagesService } from './pages.service';

const CACHE = 'public, max-age=60, stale-while-revalidate=300'; // same policy as the article endpoints

/** Read-only website API. Serves only published locales; drafts and reviews are never read. */
@ApiTags('Public · Pages')
@ApiBadRequestResponse({
  type: ErrorResponse,
  description: 'UNKNOWN_LOCALE | VALIDATION_FAILED',
})
@Public()
@Controller('public')
export class PublicPagesController {
  constructor(private readonly pages: PagesService) {}

  @Get('pages/:key')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicPage })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description:
      'PAGE_NOT_FOUND (unknown page, or this locale is not published)',
  })
  get(
    @Param('key') key: string,
    @Query() query: PublicLocaleQuery,
  ): Promise<PublicPage> {
    if (!PAGE_KEY_RE.test(key))
      throw new AppError(404, 'PAGE_NOT_FOUND', 'Page not found');
    return this.pages.publicGet(key, query.locale);
  }
}
