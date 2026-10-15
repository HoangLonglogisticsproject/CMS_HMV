import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { APP_CONFIG, type AppConfig } from '../../config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      // Memory storage: the bytes are sniffed and hashed before anything reaches object storage.
      useFactory: (config: AppConfig) => ({
        limits: {
          fileSize: config.mediaMaxBytes,
          files: 1,
          fields: 10,
          fieldSize: 4096,
        },
      }),
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
