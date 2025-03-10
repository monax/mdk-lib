import fs from 'node:fs';
import { type GetAclResponse, Storage } from '@google-cloud/storage';
import type { SaveData, SaveOptions } from '@google-cloud/storage/build/esm/src/file.js';
import { type StorageConfig, getKnownExtensionMimeType } from '@monaxlabs/mdk-schema';
import { z } from 'zod';

export { SaveData, SaveOptions } from '@google-cloud/storage/build/esm/src/file.js';

export type BucketType = z.infer<typeof BucketType>;
export const BucketType = z.enum(['public', 'private']);

export type IStorageService = InstanceType<typeof StorageService>;

export class StorageService<B extends string = BucketType, C extends StorageConfig = StorageConfig>
  implements IStorageService
{
  readonly storage: Storage;

  constructor(protected readonly config: C) {
    this.storage = new Storage({
      projectId: config.GCP_PROJECT_ID,
      keyFilename: config.GCP_KEY_FILE && fs.existsSync(config.GCP_KEY_FILE) ? config.GCP_KEY_FILE : undefined,
    });
  }

  protected bucketName(type: B) {
    return type === 'public' ? this.config.GCS_PUBLIC_FILES_BUCKET : this.config.GCS_PRIVATE_FILES_BUCKET;
  }

  cdnUrl(type: B, remotePath: string): string {
    return `${this.config.GCS_HOST}/${this.bucketName(type)}/${remotePath}`;
  }

  async saveFile(type: B, remotePath: string, data: SaveData, options?: SaveOptions): Promise<string> {
    await this.storage.bucket(this.bucketName(type)).file(remotePath).delete({ ignoreNotFound: true });

    await this.storage.bucket(this.bucketName(type)).file(remotePath).save(data, options);

    return this.cdnUrl(type, remotePath);
  }

  async deleteFile(type: B, pathOrUrl: string): Promise<void> {
    const remotePath = pathOrUrl.replace(`${this.config.GCS_HOST}/${this.bucketName(type)}/`, '').replace(/\?.*$/, '');

    const remoteFile = this.storage.bucket(this.bucketName(type)).file(remotePath);
    if (await remoteFile.exists()) {
      await remoteFile.delete();
    }
  }

  async getViewUrl(type: B, remotePath: string): Promise<string> {
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
    type: B,
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

  async getMeta(type: B, remotePath: string): Promise<GetAclResponse> {
    const info = await this.storage.bucket(this.bucketName(type)).file(remotePath).acl.get();
    return info;
  }

  async exists(type: B, remotePath: string): Promise<boolean> {
    const [exists] = await this.storage.bucket(this.bucketName(type)).file(remotePath).exists();
    return exists;
  }

  async copy(sourceType: B, source: string, destinationType: B, destination: string): Promise<void> {
    const target = this.storage.bucket(this.bucketName(destinationType)).file(destination);
    await this.storage.bucket(this.bucketName(sourceType)).file(source).copy(target);
  }
}
