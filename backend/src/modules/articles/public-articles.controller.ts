import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppError, ErrorResponse } from '../../common/errors';
import { Public } from '../auth/auth.decorators';
import {
  PublicArticle,
  PublicArticleListResponse,
  PublicArticlesQuery,
  PublicCategory,
  PublicLocaleQuery,
  SLUG_RE,
} from './article.dto';
import { ArticlesService } from './articles.service';

const CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** Read-only website API. Serves only live locales of published, non-archived articles. */
@ApiTags('Public · Articles')
@ApiBadRequestResponse({
  type: ErrorResponse,
  description: 'UNKNOWN_LOCALE | VALIDATION_FAILED',
})
@Public()
@Controller('public')
export class PublicArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('articles')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({
    type: PublicArticleListResponse,
    description: 'Newest first',
  })
  list(
    @Query() query: PublicArticlesQuery,
  ): Promise<PublicArticleListResponse> {
    return this.articles.publicList(query);
  }

  @Get('articles/:slug')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: PublicArticle })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'ARTICLE_NOT_FOUND',
  })
  get(
    @Param('slug') slug: string,
    @Query() query: PublicLocaleQuery,
  ): Promise<PublicArticle> {
    if (!SLUG_RE.test(slug))
      throw new AppError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
    return this.articles.publicGet(slug, query.locale);
  }

  @Get('article-categories')
  @Header('Cache-Control', CACHE)
  @ApiOkResponse({ type: [PublicCategory] })
  categories(@Query() query: PublicLocaleQuery): Promise<PublicCategory[]> {
    return this.articles.publicCategories(query.locale);
  }
}
