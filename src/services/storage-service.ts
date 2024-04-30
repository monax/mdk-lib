import { Storage } from '@google-cloud/storage';
import { SaveData, SaveOptions } from '@google-cloud/storage/build/esm/src/file.js';
import fs from 'fs';
import { ConfigSpec, zod as z } from 'mdk-schema';
import { getKnownExtensionMimeType } from 'mdk-schema/dist/mime-types.js';
import { coreTelemetry } from 'mdk-telemetry';

export { SaveData, SaveOptions } from '@google-cloud/storage/build/esm/src/file.js';

export type BucketType = 'public' | 'private';

export type StorageConfig = ConfigSpec<typeof StorageConfigBag>;
export const StorageConfigBag = {
  GCP_PROJECT_ID: z.string(),
  GCP_SERVICE_ACCOUNT: z.string(),
  GCP_KEY_FILE: z.string().optional(),
  GCS_HOST: z.string(),
  GCS_PUBLIC_FILES_BUCKET: z.string(),
  GCS_PRIVATE_FILES_BUCKET: z.string(),
} as const;

export type IStorageService = InstanceType<typeof StorageService>;

@coreTelemetry
export class StorageService implements IStorageService {
  readonly storage: Storage;

  constructor(protected readonly config: StorageConfig) {
    this.storage = new Storage({
      projectId: config.GCP_PROJECT_ID,
      keyFilename: config.GCP_KEY_FILE && fs.existsSync(config.GCP_KEY_FILE) ? config.GCP_KEY_FILE : undefined,
    });
  }

  private bucketName(type: BucketType) {
    return type === 'public' ? this.config.GCS_PUBLIC_FILES_BUCKET : this.config.GCS_PRIVATE_FILES_BUCKET;
  }

  cdnUrl(type: BucketType, remotePath: string): string {
    return `${this.config.GCS_HOST}/${this.bucketName(type)}/${remotePath}`;
  }

  async saveFile(type: BucketType, remotePath: string, data: SaveData, options?: SaveOptions): Promise<string> {
    await this.storage.bucket(this.bucketName(type)).file(remotePath).delete({ ignoreNotFound: true });

    await this.storage.bucket(this.bucketName(type)).file(remotePath).save(data, options);

    return this.cdnUrl(type, remotePath);
  }

  async deleteFile(type: BucketType, pathOrUrl: string): Promise<void> {
    const remotePath = pathOrUrl.replace(`${this.config.GCS_HOST}/${this.bucketName(type)}/`, '').replace(/\?.*$/, '');

    const remoteFile = this.storage.bucket(this.bucketName(type)).file(remotePath);
    if (await remoteFile.exists()) {
      await remoteFile.delete();
    }
  }

  async getViewUrl(type: BucketType, remotePath: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucketName(type))
      .file(remotePath)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 60 minutes
      });

    return url;
  }

  /**
   * Creates a PUT-signed URL for uploading an object to a bucket.
   * @link https://cloud.google.com/storage/docs/samples/storage-generate-upload-signed-url-v4#storage_generate_upload_signed_url_v4-nodejs
   */
  async getUploadUrl(
    type: BucketType,
    remotePath: string,
    { contentType }: { contentType?: string } = {},
  ): Promise<{ uploadUrl: string; remotePath: string; publicUrl: string; contentType: string }> {
    const extension = remotePath.replace(/\?.*/g, '').replace(/(.*\.)/g, '');
    contentType = contentType ?? getKnownExtensionMimeType(extension) ?? 'application/octet-stream';

    const [url] = await this.storage
      .bucket(this.bucketName(type))
      .file(remotePath)
      .getSignedUrl({
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });

    const publicUrl = type === 'public' ? this.cdnUrl(type, remotePath) : await this.getViewUrl(type, remotePath);
    return { uploadUrl: url, remotePath, publicUrl, contentType };
  }
}
