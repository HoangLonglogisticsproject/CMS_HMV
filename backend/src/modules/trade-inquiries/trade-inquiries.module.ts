import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config';
import { TradeInquiryIngestGuard } from './ingest.guard';
import {
  INQUIRY_NOTIFIER,
  disabledNotifier,
  smtpNotifier,
} from './inquiry-notifier';
import {
  AdminTradeInquiriesController,
  TradeInquiryIngestController,
} from './trade-inquiries.controller';
import { TradeInquiriesService } from './trade-inquiries.service';

@Module({
  controllers: [TradeInquiryIngestController, AdminTradeInquiriesController],
  providers: [
    TradeInquiriesService,
    TradeInquiryIngestGuard,
    {
      provide: INQUIRY_NOTIFIER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.tradeInquiries.notify.enabled
          ? smtpNotifier(config.tradeInquiries.notify)
          : disabledNotifier,
    },
  ],
})
export class TradeInquiriesModule {}
