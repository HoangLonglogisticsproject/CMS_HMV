import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
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
  PAGE_KEY_RE,
  PageDetailResponse,
  PageListResponse,
  PageRevisionRefDto,
  RequestPageChangesDto,
  SavePageDraftDto,
} from './page.dto';
import { PagesService } from './pages.service';

const actor = (auth: AuthContext) => ({ userId: auth.userId, ip: auth.ip });
const pageKey = (key: string) => {
  if (!PAGE_KEY_RE.test(key))
    throw new AppError(404, 'PAGE_NOT_FOUND', 'Page not found');
  return key;
};
const localeParam = (locale: string) => {
  if (!LOCALE_RE.test(locale))
    throw new AppError(404, 'TRANSLATION_NOT_FOUND', 'Translation not found');
  return locale;
};

/** Website pages: draft → submit → approve or request changes → publish, per locale. */
@ApiTags('Admin · Pages')
@ApiNotFoundResponse({
  type: ErrorResponse,
  description: 'PAGE_NOT_FOUND | TRANSLATION_NOT_FOUND',
})
@Controller('admin/pages')
export class AdminPagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @RequirePermissions('page:read')
  @ApiOkResponse({ type: PageListResponse })
  list(): Promise<PageListResponse> {
    return this.pages.list();
  }

  @Get(':key')
  @RequirePermissions('page:read')
  @ApiOkResponse({ type: PageDetailResponse })
  get(@Param('key') key: string): Promise<PageDetailResponse> {
    return this.pages.get(pageKey(key));
  }

  @Patch(':key/draft')
  @RequirePermissions('page:write')
  @ApiOkResponse({
    type: PageDetailResponse,
    description: 'Saves a new draft revision. Published content is untouched.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'UNKNOWN_LOCALE | TRANSLATION_INCOMPLETE',
  })
  saveDraft(
    @Param('key') key: string,
    @Body() dto: SavePageDraftDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<PageDetailResponse> {
    return this.pages.saveDraft(pageKey(key), dto, actor(auth));
  }

  @Post(':key/translations/:locale/submit')
  @HttpCode(200)
  @RequirePermissions('page:write')
  @ApiOkResponse({
    type: PageDetailResponse,
    description: 'Submits a complete translation for review.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'TRANSLATION_INCOMPLETE',
  })
  submit(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @Body() dto: PageRevisionRefDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<PageDetailResponse> {
    return this.pages.submit(
      pageKey(key),
      localeParam(locale),
      dto,
      actor(auth),
    );
  }

  @Post(':key/translations/:locale/approve')
  @HttpCode(200)
  @RequirePermissions('page:review')
  @ApiOkResponse({
    type: PageDetailResponse,
    description: 'Approves exactly the submitted content.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT | TRANSLATION_NOT_SUBMITTED',
  })
  approve(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @Body() dto: PageRevisionRefDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<PageDetailResponse> {
    return this.pages.approve(
      pageKey(key),
      localeParam(locale),
      dto,
      actor(auth),
    );
  }

  @Post(':key/translations/:locale/request-changes')
  @HttpCode(200)
  @RequirePermissions('page:review')
  @ApiOkResponse({
    type: PageDetailResponse,
    description:
      'Sends a submitted or approved translation back to the editor with a note.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT | TRANSLATION_NOT_SUBMITTED',
  })
  requestChanges(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @Body() dto: RequestPageChangesDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<PageDetailResponse> {
    return this.pages.requestChanges(
      pageKey(key),
      localeParam(locale),
      dto,
      actor(auth),
    );
  }

  @Post(':key/translations/:locale/publish')
  @HttpCode(200)
  @RequirePermissions('page:publish')
  @ApiOkResponse({
    type: PageDetailResponse,
    description:
      'Makes the approved draft of this locale live. Other locales are untouched.',
  })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'REVISION_CONFLICT | TRANSLATION_NOT_APPROVED',
  })
  publish(
    @Param('key') key: string,
    @Param('locale') locale: string,
    @Body() dto: PageRevisionRefDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<PageDetailResponse> {
    return this.pages.publish(
      pageKey(key),
      localeParam(locale),
      dto,
      actor(auth),
    );
  }
}
