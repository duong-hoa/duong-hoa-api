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
import { S3Service } from './s3.service'

// Direct port of src/app/api/data/storage/route.ts.
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
  constructor(private readonly s3Service: S3Service) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Body('path') requestedPath?: string) {
    if (!file || !requestedPath) {
      throw new BadRequestException('Invalid upload file')
    }

    try {
      const key = sanitizeObjectKey(requestedPath)
      await this.s3Service.uploadObject({ key, body: file.buffer, contentType: file.mimetype || undefined })
      return { path: key, key }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      const message = error instanceof Error ? error.message : 'Upload failed'
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
