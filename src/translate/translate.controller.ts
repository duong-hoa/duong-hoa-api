import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { TranslateService } from './translate.service'
import { TranslateTextDto, TranslateHtmlDto, TranslateBatchDto, TranslateContentDto } from './dto/translate.dto'

// Mirrors the direct 'use server' calls to translateText/translateHTML/
// translateBatch/translateContentObject (src/lib/auto-translate.ts) made
// straight from the admin UI's client components.
@UseGuards(JwtAuthGuard)
@Controller('admin/translate')
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  @Post('text')
  translateText(@Body() dto: TranslateTextDto) {
    return this.translateService.translateText(dto.text, dto.fromLang, dto.toLang, dto.engine)
  }

  @Post('html')
  translateHtml(@Body() dto: TranslateHtmlDto) {
    return this.translateService.translateHTML(dto.text, dto.fromLang, dto.toLang, dto.engine)
  }

  @Post('batch')
  translateBatch(@Body() dto: TranslateBatchDto) {
    return this.translateService.translateBatch(dto.texts, dto.fromLang, dto.toLang, dto.isHTML, dto.engine)
  }

  @Post('content')
  translateContent(@Body() dto: TranslateContentDto) {
    return this.translateService.translateContentObject(dto.content, dto.fromLang, dto.engine)
  }
}
