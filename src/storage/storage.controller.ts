import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { S3StorageService } from './s3-storage.service'

function sanitizeObjectKey(input: string) {
  const key = input.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!key || key.split('/').some((segment) => segment === '..')) {
    throw new BadRequestException('Invalid upload path')
  }
  return key.startsWith('uploads/') ? key : `uploads/${key}`
}

@UseGuards(JwtAuthGuard)
@Controller('admin/storage')
export class StorageController {
  constructor(private readonly storageService: S3StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body('path') requestedPath?: string) {
    if (!file || !requestedPath) {
      throw new BadRequestException('Invalid upload file')
    }

    try {
      const key = sanitizeObjectKey(requestedPath)
      await this.storageService.uploadObject({ key, body: file.buffer })
      // `path` is the full public URL — stored as-is in ContentBlock/settings
      // content going forward, so nothing needs to resolve it again at
      // display time. `key` is still the raw object key, kept for callers
      // that need it (e.g. future delete support).
      return { path: this.storageService.publicUrl(key), key }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      const message = error instanceof Error ? error.message : 'Upload failed'
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
