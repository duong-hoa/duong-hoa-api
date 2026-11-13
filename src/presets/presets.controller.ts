import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ActivatePresetDto, CreatePageFromPresetDto, CreatePresetDto, ResetPresetSelectionDto } from './presets.dto'
import { PresetsService } from './presets.service'

@UseGuards(JwtAuthGuard)
@Controller('admin/cms-presets')
export class PresetsController {
  constructor(private readonly presets: PresetsService) {}

  @Get()
  list(@Query('kind') kind?: string, @Query('scope') scope?: string) {
    return this.presets.list(kind, scope)
  }

  @Get('pages/:pageId/state')
  pageState(@Param('pageId') pageId: string) { return this.presets.pageState(pageId) }

  @Post()
  create(@Body() input: CreatePresetDto) { return this.presets.create(input) }

  @Post('reset-selection')
  resetSelection(@Body() input: ResetPresetSelectionDto) { return this.presets.resetSelection(input) }

  @Post('pages/:pageId/reset')
  resetPage(@Param('pageId') pageId: string) { return this.presets.resetPage(pageId) }

  @Post('pages/:pageId/apply/:id')
  applyPage(@Param('pageId') pageId: string, @Param('id') id: string) { return this.presets.applyPage(pageId, id) }

  @Post(':id/activate')
  activate(@Param('id') id: string, @Body() input: ActivatePresetDto) { return this.presets.activate(id, input.target) }

  @Post(':id/create-page')
  createPage(@Param('id') id: string, @Body() input: CreatePageFromPresetDto) { return this.presets.createPage(id, input) }

  @Delete(':id')
  delete(@Param('id') id: string) { return this.presets.delete(id) }
}
