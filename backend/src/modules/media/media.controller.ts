import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../common/errors';
import {
  type AuthContext,
  CurrentUser,
  RequirePermissions,
} from '../auth/auth.decorators';
import {
  ListMediaQuery,
  MediaAssetResponse,
  MediaListResponse,
  MediaUsageResponse,
  UpdateMediaDto,
  UploadMediaDto,
} from './media.dto';
import { MediaService, type UploadedImage } from './media.service';

const actor = (auth: AuthContext) => ({ userId: auth.userId, ip: auth.ip });

@ApiTags('Admin · Media')
@ApiNotFoundResponse({ type: ErrorResponse, description: 'MEDIA_NOT_FOUND' })
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @RequirePermissions('media:read')
  @ApiOkResponse({ type: MediaListResponse })
  list(@Query() query: ListMediaQuery): Promise<MediaListResponse> {
    return this.media.list(query);
  }

  @Post()
  @RequirePermissions('media:write')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG or WebP. Type is detected from the bytes.',
        },
        title: { type: 'string', maxLength: 200 },
        category: {
          type: 'string',
          enum: ['COMMODITY', 'FACILITY', 'LOGISTICS', 'CERTIFICATE', 'EVENT'],
        },
      },
    },
  })
  @ApiCreatedResponse({ type: MediaAssetResponse })
  @ApiPayloadTooLargeResponse({
    type: ErrorResponse,
    description: 'PAYLOAD_TOO_LARGE',
  })
  @ApiUnsupportedMediaTypeResponse({
    type: ErrorResponse,
    description: 'UNSUPPORTED_MEDIA_TYPE',
  })
  upload(
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: UploadMediaDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<MediaAssetResponse> {
    return this.media.upload(file, dto, actor(auth));
  }

  @Get(':id')
  @RequirePermissions('media:read')
  @ApiOkResponse({ type: MediaAssetResponse })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<MediaAssetResponse> {
    return this.media.get(id);
  }

  @Patch(':id')
  @RequirePermissions('media:write')
  @ApiOkResponse({ type: MediaAssetResponse })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMediaDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<MediaAssetResponse> {
    return this.media.update(id, dto, actor(auth));
  }

  @Get(':id/usages')
  @RequirePermissions('media:read')
  @ApiOkResponse({ type: MediaUsageResponse })
  usages(@Param('id', ParseUUIDPipe) id: string): Promise<MediaUsageResponse> {
    return this.media.usages(id);
  }
}
