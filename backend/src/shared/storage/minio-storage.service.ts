import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import {
  STORAGE_BUCKETS,
  StorageBucket,
} from './storage.constants';
import { IStorageService, StorageUploadInput } from './storage.interface';

@Injectable()
export class MinioStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private client: Minio.Client | null = null;
  private readonly bucketsInitialized = new Set<StorageBucket>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Connects to Minio and ensures application buckets exist.
   */
  async onModuleInit(): Promise<void> {
    try {
      this.client = new Minio.Client({
        endPoint:  this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
        port:      parseInt(this.configService.get<string>('MINIO_PORT', '9000'), 10),
        useSSL:    this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
        accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'erp_minio'),
        secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'erp_minio_dev_password'),
        pathStyle: true,
      });

      this.logger.log(
        `Minio config: endpoint=${this.configService.get('MINIO_ENDPOINT')} ` +
        `port=${this.configService.get('MINIO_PORT')} ` +
        `ssl=${this.configService.get('MINIO_USE_SSL')} ` +
        `bucket check starting...`
      );

      try {
        for (const bucket of Object.values(STORAGE_BUCKETS)) {
          this.logger.log(`Checking bucket: ${bucket}`);
          await this.ensureBucket(bucket);
          this.logger.log(`Bucket ready: ${bucket}`);
        }
        this.logger.log('Minio storage ready');
      } catch (bucketError: unknown) {
        this.logger.warn('Minio client connected but bucket setup failed');
        if (bucketError instanceof Error) {
          this.logger.warn(`Bucket error name: ${bucketError.name}`);
          this.logger.warn(`Bucket error message: ${bucketError.message}`);
          this.logger.warn(`Bucket error stack: ${bucketError.stack ?? 'no stack'}`);
        } else {
          this.logger.warn(`Bucket raw error: ${JSON.stringify(bucketError)}`);
        }
        // Still mark client as null if buckets cannot be verified
        this.client = null;
      }
    } catch (error: unknown) {
      this.logger.warn(
        'Minio unavailable - document upload/download disabled until storage is running'
      );
      if (error instanceof Error) {
        this.logger.warn(`Error name: ${error.name}`);
        this.logger.warn(`Error message: ${error.message}`);
        this.logger.warn(`Error stack: ${error.stack ?? 'no stack'}`);
      } else {
        this.logger.warn(`Raw error: ${JSON.stringify(error)}`);
        this.logger.warn(`Error string: ${String(error)}`);
      }
      // Log the exact config that was used so we can confirm env vars
      this.logger.warn(
        `Config used — endpoint: ${this.configService.get('MINIO_ENDPOINT')}, ` +
        `port: ${this.configService.get('MINIO_PORT')}, ` +
        `ssl: ${this.configService.get('MINIO_USE_SSL')}, ` +
        `accessKey length: ${(this.configService.get<string>('MINIO_ACCESS_KEY') ?? '').length} chars, ` +
        `secretKey length: ${(this.configService.get<string>('MINIO_SECRET_KEY') ?? '').length} chars`
      );
      this.client = null;
    }
  }

  async ensureBucket(bucket: StorageBucket): Promise<void> {
    const client = this.requireClient();
    if (this.bucketsInitialized.has(bucket)) {
      return;
    }

    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      this.logger.log(`Created storage bucket: ${bucket}`);
    }

    this.bucketsInitialized.add(bucket);
  }

  async upload(input: StorageUploadInput): Promise<void> {
    const client = this.requireClient();
    await this.ensureBucket(input.bucket);

    const metaData = { 'Content-Type': input.contentType };
    if (Buffer.isBuffer(input.body)) {
      await client.putObject(
        input.bucket,
        input.key,
        input.body,
        input.contentLength,
        metaData,
      );
      return;
    }

    await client.putObject(
      input.bucket,
      input.key,
      input.body,
      input.contentLength,
      metaData,
    );
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    const client = this.requireClient();
    await client.removeObject(bucket, key);
  }

  async getPresignedDownloadUrl(
    bucket: StorageBucket,
    key: string,
    expiresSeconds = 900,
  ): Promise<string> {
    const client = this.requireClient();
    return client.presignedGetObject(bucket, key, expiresSeconds);
  }

  private requireClient(): Minio.Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Object storage is unavailable. Start Minio with npm run db:up',
      );
    }
    return this.client;
  }
}
