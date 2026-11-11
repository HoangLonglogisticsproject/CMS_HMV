import {
  Body,
  Controller,
  Get,
  Req,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ErrorResponse } from '../../common/errors';
import {
  type AuthContext,
  CurrentUser,
  Public,
  RequirePermissions,
} from '../auth/auth.decorators';
import { TradeInquiryIngestGuard } from './ingest.guard';
import {
  CreateTradeInquiryNoteDto,
  IngestTradeInquiryDto,
  IngestTradeInquiryResponse,
  InquiryAssigneeListResponse,
  TradeInquiryDetailResponse,
  TradeInquiryListQuery,
  TradeInquiryListResponse,
  TradeInquiryNoteResponse,
  TradeInquiryStatsResponse,
  UpdateTradeInquiryDto,
} from './trade-inquiry.dto';
import { TradeInquiriesService } from './trade-inquiries.service';

const actor = (auth: AuthContext) => ({ userId: auth.userId, ip: auth.ip });

/** Website → CMS (server to server). Not a browser endpoint: no CORS is configured for the website. */
@ApiTags('Integrations · Trade inquiries')
@Controller('integrations/trade-inquiries')
export class TradeInquiryIngestController {
  constructor(private readonly inquiries: TradeInquiriesService) {}

  // SECURITY: @Public() opts out of the session guard only. TradeInquiryIngestGuard (HMAC over timestamp and
  // idempotency key with the shared secret) protects this route; it is not reachable without that secret.
  @Post()
  @Public()
  @UseGuards(TradeInquiryIngestGuard)
  @ApiHeader({
    name: 'X-HMV-Timestamp',
    required: true,
    description: 'Unix time in seconds (±5 minutes)',
  })
  @ApiHeader({
    name: 'X-HMV-Signature',
    required: true,
    description: 'hex HMAC-SHA256(secret, "<timestamp>.<idempotencyKey>")',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '8-64 letters, digits or hyphens',
  })
  @ApiCreatedResponse({
    type: IngestTradeInquiryResponse,
    description: 'New inquiry',
  })
  @ApiOkResponse({
    type: IngestTradeInquiryResponse,
    description: 'Known idempotency key: the existing inquiry',
  })
  @ApiResponse({
    status: 400,
    type: ErrorResponse,
    description: 'VALIDATION_FAILED',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description: 'SIGNATURE_INVALID',
  })
  @ApiResponse({
    status: 503,
    type: ErrorResponse,
    description: 'INTEGRATION_DISABLED',
  })
  async ingest(
    @Body() dto: IngestTradeInquiryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IngestTradeInquiryResponse> {
    // Checked by TradeInquiryIngestGuard (format and signature) before this runs; read here, documented by @ApiHeader.
    const idempotencyKey = req.header('idempotency-key')!;
    const result = await this.inquiries.ingest(dto, idempotencyKey);
    res.status(result.duplicate ? 200 : 201);
    return result;
  }
}

/** The sales inbox. Reads need inquiry:read; writes need inquiry:write (plus the CSRF header, like every admin write). */
@ApiTags('Admin · Trade inquiries')
@Controller('admin/trade-inquiries')
export class AdminTradeInquiriesController {
  constructor(private readonly inquiries: TradeInquiriesService) {}

  @Get()
  @RequirePermissions('inquiry:read')
  @ApiOkResponse({ type: TradeInquiryListResponse })
  list(
    @Query() query: TradeInquiryListQuery,
  ): Promise<TradeInquiryListResponse> {
    return this.inquiries.list(query);
  }

  @Get('stats')
  @RequirePermissions('inquiry:read')
  @ApiOkResponse({ type: TradeInquiryStatsResponse })
  stats(): Promise<TradeInquiryStatsResponse> {
    return this.inquiries.stats();
  }

  @Get('assignees')
  @RequirePermissions('inquiry:read')
  @ApiOkResponse({ type: InquiryAssigneeListResponse })
  assignees(): Promise<InquiryAssigneeListResponse> {
    return this.inquiries.assignees();
  }

  @Get(':id')
  @RequirePermissions('inquiry:read')
  @ApiOkResponse({ type: TradeInquiryDetailResponse })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'INQUIRY_NOT_FOUND',
  })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TradeInquiryDetailResponse> {
    return this.inquiries.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('inquiry:write')
  @ApiOkResponse({ type: TradeInquiryDetailResponse })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'INQUIRY_NOT_FOUND',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'ASSIGNEE_INVALID',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTradeInquiryDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<TradeInquiryDetailResponse> {
    return this.inquiries.update(id, dto, actor(auth));
  }

  @Post(':id/notes')
  @RequirePermissions('inquiry:write')
  @ApiCreatedResponse({ type: TradeInquiryNoteResponse })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'INQUIRY_NOT_FOUND',
  })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTradeInquiryNoteDto,
    @CurrentUser() auth: AuthContext,
  ): Promise<TradeInquiryNoteResponse> {
    return this.inquiries.addNote(id, dto.body, actor(auth));
  }

  @Post(':id/resend-notification')
  @RequirePermissions('inquiry:write')
  @ApiCreatedResponse({ type: TradeInquiryDetailResponse })
  @ApiNotFoundResponse({
    type: ErrorResponse,
    description: 'INQUIRY_NOT_FOUND',
  })
  resendNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() auth: AuthContext,
  ): Promise<TradeInquiryDetailResponse> {
    return this.inquiries.resendNotification(id, actor(auth));
  }
}
