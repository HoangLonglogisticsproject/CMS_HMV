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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { LOCALE_RE } from '../../common/dto';
import { AppError, ErrorResponse } from '../../common/errors';
import {
  type AuthContext,
  CurrentUser,
  RequirePermissions,
} from '../auth/auth.decorators';
import {
  ArticleCategoryResponse,
  ArticleDetailResponse,
  ArticleListResponse,
  ArticleStatsResponse,
  CreateArticleDto,
  ListArticlesQuery,
  LocaleQuery,
  PublicArticle,
  RevisionRefDto,
  UpdateArticleDraftDto,
} from './article.dto';
import { ArticlesService } from './articles.service';

const actor = (auth: AuthContext) => ({ userId: auth.userId, ip: auth.ip });
const WRITE_ERRORS =
  'RICH_CONTENT_INVALID | UNKNOWN_LOCALE | UNKNOWN_CATEGORY | MEDIA_NOT_FOUND | TRANSLATION_INCOMPLETE';

@ApiTags('Admin · Articles')
@ApiNotFoundResponse({
  type: ErrorResponse,
  description: 'ARTICLE_NOT_FOUND | TRANSLATION_NOT_FOUND',
})
@Controller('admin/articles')
export class AdminArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @RequirePermissions('article:read')
  @ApiOkResponse({ type: ArticleListResponse })
  list(@Query() query: ListArticlesQuery): Promise<ArticleListResponse> {
    return this.articles.list(query);
  }

  @Get('stats')
  @RequirePermissions('article:read')
  @ApiOkResponse({
    type: ArticleStatsResponse,
    description: 'Counts across all pages',
  })
  stats(): Promise<ArticleStatsResponse> {
    return this.articles.stats();
  }

  @Post()
  @RequirePermissions('article:write')
  @ApiCreatedResponse({
    type: ArticleDetailResponse,
    description: 'Creates the article with draft revision 1',
  })
  @ApiConflictResponse({ type: ErrorResponse, description: 'SLUG_TAKEN' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: WRITE_ERRORS,
  })
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<ArticleDetailResponse> {
    return this.articles.create(dto, actor(auth));
  }

  @Get(':id')
  @RequirePermissions('article:read')
  @ApiOkResponse({
    type: ArticleDetailResponse,
    description: 'Current draft plus publication state',
  })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ArticleDetailResponse> {
    return this.articles.get(id);
  }

  @Patch(':id/draft')
  @RequirePermissions('article:write')
  @ApiOkResponse({
    type: ArticleDetailResponse,
    description: 'Saves a new draft revision. Published content is untouched.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT | SLUG_TAKEN | ARTICLE_ARCHIVED',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: WRITE_ERRORS,
  })
  updateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDraftDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<ArticleDetailResponse> {
    return this.articles.updateDraft(id, dto, actor(auth));
  }

  @Get(':id/preview')
  @RequirePermissions('article:read')
  @ApiOkResponse({
    type: PublicArticle,
    description: 'The current draft rendered in the public response shape',
  })
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: LocaleQuery,
  ): Promise<PublicArticle> {
    return this.articles.preview(id, query.locale);
  }

  @Post(':id/translations/:locale/approve')
  @HttpCode(200)
  @RequirePermissions('article:review')
  @ApiOkResponse({ type: ArticleDetailResponse })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT | ARTICLE_ARCHIVED',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'TRANSLATION_INCOMPLETE',
  })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locale') locale: string,
    @Body() dto: RevisionRefDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<ArticleDetailResponse> {
    if (!LOCALE_RE.test(locale))
      throw new AppError(404, 'TRANSLATION_NOT_FOUND', 'Unknown locale');
    return this.articles.approve(id, locale, dto, actor(auth));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('article:publish')
  @ApiOkResponse({
    type: ArticleDetailResponse,
    description:
      'Publishes the draft revision; every approved locale goes live',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description:
      'TRANSLATION_NOT_APPROVED | REVISION_CONFLICT | ARTICLE_ARCHIVED',
  })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevisionRefDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<ArticleDetailResponse> {
    return this.articles.publish(id, dto, actor(auth));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('article:archive')
  @ApiOkResponse({ type: ArticleDetailResponse })
  @ApiConflictResponse({ type: ErrorResponse, description: 'ARTICLE_ARCHIVED' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() auth: AuthContext,
  ): Promise<ArticleDetailResponse> {
    return this.articles.archive(id, actor(auth));
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions('article:archive')
  @ApiOkResponse({ type: ArticleDetailResponse })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'ARTICLE_NOT_ARCHIVED',
  })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() auth: AuthContext,
  ): Promise<ArticleDetailResponse> {
    return this.articles.restore(id, actor(auth));
  }
}

@ApiTags('Admin · Articles')
@Controller('admin/article-categories')
export class AdminArticleCategoriesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @RequirePermissions('article:read')
  @ApiOkResponse({ type: [ArticleCategoryResponse] })
  list(): Promise<ArticleCategoryResponse[]> {
    return this.articles.categories();
  }
}
