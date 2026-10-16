import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STORAGE_BUCKETS,
  StorageBucket,
} from './storage.constants';
import { IStorageService, StorageUploadInput } from './storage.interface';

@Injectable()
export class MinioStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private s3Client: S3Client | null = null;
  private readonly bucketsInitialized = new Set<StorageBucket>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Connects to S3-compatible storage and pre-registers known buckets.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Use MINIO_ENDPOINT directly as the full URL - it already includes
      // the protocol and path (https://[ref].supabase.co/storage/v1/s3)
      const endpoint = this.configService.get<string>('MINIO_ENDPOINT', '');

      this.s3Client = new S3Client({
        region: this.configService.get<string>('MINIO_REGION', 'auto'),
        endpoint,
        credentials: {
          accessKeyId: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
          secretAccessKey: this.configService.get<string>(
            'MINIO_SECRET_KEY',
            '',
          ),
        },
        forcePathStyle: true,
      });

      for (const bucket of Object.values(STORAGE_BUCKETS)) {
        this.bucketsInitialized.add(bucket);
      }

      this.logger.log(`S3 storage ready - endpoint: ${endpoint}`);
    } catch (error: unknown) {
      this.logger.warn(
        'S3 storage unavailable - document upload/download disabled until storage is running',
      );
      this.logger.warn(
        error instanceof Error ? error.message : String(error),
      );
      this.s3Client = null;
    }
  }

  async ensureBucket(bucket: StorageBucket): Promise<void> {
    this.requireClient();
    if (this.bucketsInitialized.has(bucket)) {
      return;
    }

    this.bucketsInitialized.add(bucket);
  }

  async upload(input: StorageUploadInput): Promise<void> {
    const client = this.requireClient();
    await this.ensureBucket(input.bucket);

    await client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      }),
    );
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    const client = this.requireClient();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  }

  async getPresignedDownloadUrl(
    bucket: StorageBucket,
    key: string,
    expiresSeconds = 900,
  ): Promise<string> {
    const client = this.requireClient();

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresSeconds },
    );
  }

  private requireClient(): S3Client {
    if (!this.s3Client) {
      throw new ServiceUnavailableException(
        'Object storage is unavailable. Start Minio with npm run db:up',
      );
    }
    return this.s3Client;
  }
}
