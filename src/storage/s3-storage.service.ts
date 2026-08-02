import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

// Uploaded files go straight to an S3 (or S3-compatible) bucket instead of
// this server's own disk — this service never touches the local filesystem.
// S3_ENDPOINT/S3_FORCE_PATH_STYLE only matter for non-AWS S3-compatible
// providers (MinIO, R2, Spaces, ...); leave them unset for real AWS S3.
@Injectable()
export class S3StorageService {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl: string

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'dkas-media'
    this.publicBaseUrl = (this.config.get<string>('S3_PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '')

    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') || 'us-east-1',
      endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
      },
    })
  }

  async uploadObject(input: { key: string; body: Buffer }) {
    if (!this.bucket) {
      throw new Error('S3_NOT_CONFIGURED: S3_BUCKET environment variable is missing on backend')
    }
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: input.key, Body: input.body }),
    )
    return input.key
  }

  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined)
  }

  // Full public link for a stored key — formatted as domain/bucket/file
  publicUrl(key: string) {
    const cleanKey = key.replace(/^\/+/, '')
    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.replace(/\/+$/, '')
      if (!this.bucket || base.endsWith(`/${this.bucket}`)) {
        return `${base}/${cleanKey}`
      }
      return `${base}/${this.bucket}/${cleanKey}`
    }
    return this.bucket ? `/${this.bucket}/${cleanKey}` : `/${cleanKey}`
  }
}
