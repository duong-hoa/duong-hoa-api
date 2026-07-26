import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { MediaService } from './media.service'
import { MediaInputDto } from './dto/media-input.dto'

@UseGuards(JwtAuthGuard)
@Controller('admin/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  list() {
    return this.mediaService.list()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id)
  }

  @Post()
  create(@Body() input: MediaInputDto) {
    return this.mediaService.create(input)
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.mediaService.delete(id)
  }
}
