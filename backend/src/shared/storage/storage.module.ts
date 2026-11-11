import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MinioStorageService } from './minio-storage.service';
import { STORAGE_SERVICE } from './storage.constants';
import { IStorageService } from './storage.interface';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MinioStorageService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService, MinioStorageService],
      useFactory: (
        config: ConfigService,
        minioStorage: MinioStorageService,
      ): IStorageService => {
        const provider = config.get<string>('STORAGE_PROVIDER', 'minio');
        if (provider === 'minio') {
          return minioStorage;
        }
        return minioStorage;
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
