import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

// Direct port of src/lib/s3.ts.
@Injectable()
export class S3Service {
  constructor(private readonly config: ConfigService) {}

  private requireS3Env() {
    const endpoint = this.config.get<string>('S3_ENDPOINT')
    const bucket = this.config.get<string>('S3_BUCKET')
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID')
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY')

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('Missing S3 upload env configuration')
    }

    return { endpoint, bucket, accessKeyId, secretAccessKey }
  }

  private getClient() {
    const { endpoint, accessKeyId, secretAccessKey } = this.requireS3Env()
    return new S3Client({
      region: this.config.get<string>('S3_REGION') || 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  async uploadObject(input: { key: string; body: Buffer; contentType?: string }) {
    const { bucket } = this.requireS3Env()

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    )

    return input.key
  }
}
