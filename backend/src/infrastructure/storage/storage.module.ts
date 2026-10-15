import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config';
import { LocalDiskStorage } from './local-storage';
import { OBJECT_STORAGE } from './object-storage';
import { R2Storage } from './r2-storage';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [APP_CONFIG],
      useFactory: ({ storage }: AppConfig) =>
        storage.driver === 'r2'
          ? new R2Storage({
              endpoint: storage.r2.endpoint,
              bucket: storage.r2.bucket,
              accessKeyId: storage.r2.accessKeyId,
              secretAccessKey: storage.r2.secretAccessKey,
              publicBaseUrl: storage.publicBaseUrl,
            })
          : new LocalDiskStorage(storage.localDir, storage.publicBaseUrl),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
