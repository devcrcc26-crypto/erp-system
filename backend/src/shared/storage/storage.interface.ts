import { Readable } from 'stream';
import { StorageBucket } from './storage.constants';

export interface StorageUploadInput {
  bucket: StorageBucket;
  key: string;
  body: Buffer | Readable;
  contentType: string;
  contentLength: number;
}

export interface IStorageService {
  /**
   * Creates the bucket when it does not exist.
   */
  ensureBucket(bucket: StorageBucket): Promise<void>;

  /**
   * Uploads an object to the configured storage provider.
   */
  upload(input: StorageUploadInput): Promise<void>;

  /**
   * Removes an object from storage.
   */
  delete(bucket: StorageBucket, key: string): Promise<void>;

  /**
   * Returns a time-limited download URL for an object.
   */
  getPresignedDownloadUrl(
    bucket: StorageBucket,
    key: string,
    expiresSeconds?: number,
  ): Promise<string>;
}
