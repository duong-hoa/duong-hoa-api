import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { dirname, join, resolve } from 'path'

// Writes uploaded files straight onto the backend server's own disk instead
// of a separate S3-compatible bucket. `UPLOADS_DIR` (defaults to ./uploads,
// i.e. /app/uploads inside the container) is mounted as a Docker volume in
// docker-compose.yml so files survive `docker compose up -d --build`
// recreating the container on every deploy. Served back publicly by
// ServeStaticModule in app.module.ts, which maps that same directory to the
// `/uploads` URL path.
@Injectable()
export class LocalStorageService {
  constructor(private readonly config: ConfigService) {}

  // The "uploads" folder itself — keys arrive already prefixed with
  // "uploads/" (see sanitizeObjectKey in storage.controller.ts), which is
  // also the public URL prefix ServeStaticModule maps to this directory, so
  // that prefix is stripped here rather than nested a second time on disk.
  private get uploadsRoot() {
    return resolve(this.config.get<string>('UPLOADS_DIR') || join(process.cwd(), 'uploads'))
  }

  private relativePath(key: string) {
    return key.startsWith('uploads/') ? key.slice('uploads/'.length) : key
  }

  async uploadObject(input: { key: string; body: Buffer }) {
    const fullPath = join(this.uploadsRoot, this.relativePath(input.key))
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, input.body)
    return input.key
  }

  async deleteObject(key: string) {
    const fullPath = join(this.uploadsRoot, this.relativePath(key))
    await unlink(fullPath).catch(() => undefined)
  }
}
