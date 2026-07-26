import { Injectable } from '@nestjs/common'
import type { Media } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MediaInputDto } from './dto/media-input.dto'

function toMediaRow(media: Media) {
  return {
    id: media.id,
    filename: media.filename,
    storage_path: media.storagePath,
    url: media.url,
    alt_vi: media.altVi,
    alt_en: media.altEn,
    file_type: media.fileType,
    width: media.width,
    height: media.height,
    file_size: media.fileSize,
    created_at: media.createdAt,
  }
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.media.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(toMediaRow)
  }

  async findOne(id: string) {
    const row = await this.prisma.media.findUnique({ where: { id } })
    return row ? toMediaRow(row) : null
  }

  async create(input: MediaInputDto) {
    const row = await this.prisma.media.create({
      data: {
        filename: input.filename,
        storagePath: input.storage_path,
        url: input.url,
        altVi: input.alt_vi ?? undefined,
        altEn: input.alt_en ?? undefined,
        fileType: input.file_type ?? undefined,
        width: input.width ?? undefined,
        height: input.height ?? undefined,
        fileSize: input.file_size ?? undefined,
      },
    })
    return toMediaRow(row)
  }

  async delete(id: string) {
    await this.prisma.media.delete({ where: { id } })
  }
}
