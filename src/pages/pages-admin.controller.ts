import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PagesService } from './pages.service'
import { PageInputDto } from './dto/page-input.dto'
import { PageCategoryInputDto } from './dto/page-category-input.dto'
import { BlockInputDto, ReorderBlockDto } from './dto/block-input.dto'

// Mirrors the page/block admin server actions in src/lib/admin-actions.ts.
@UseGuards(JwtAuthGuard)
@Controller('admin/pages')
export class PagesAdminController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  getAdminPages() {
    return this.pagesService.getAdminPages()
  }

  @Get(':slug')
  getAdminPageBySlug(@Param('slug') slug: string) {
    return this.pagesService.getAdminPageBySlug(slug)
  }

  @Post()
  createPage(@Body() input: PageInputDto) {
    return this.pagesService.createPage(input)
  }

  @Patch(':id')
  updatePage(@Param('id') id: string, @Body() input: PageInputDto) {
    return this.pagesService.updatePage(id, input)
  }

  @Delete(':id')
  deletePage(@Param('id') id: string) {
    return this.pagesService.deletePage(id)
  }

  @Post(':id/duplicate')
  duplicatePage(@Param('id') id: string, @Body() input: PageInputDto) {
    return this.pagesService.duplicatePage(id, input)
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/page-categories')
export class PageCategoriesAdminController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  getPageCategories() {
    return this.pagesService.getPageCategories()
  }

  @Post()
  createPageCategory(@Body() input: PageCategoryInputDto) {
    return this.pagesService.createPageCategory(input)
  }

  @Patch(':id')
  updatePageCategory(@Param('id') id: string, @Body() input: PageCategoryInputDto) {
    return this.pagesService.updatePageCategory(id, input)
  }

  @Delete(':id')
  deletePageCategory(@Param('id') id: string) {
    return this.pagesService.deletePageCategory(id)
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/blocks')
export class BlocksAdminController {
  constructor(private readonly pagesService: PagesService) {}

  @Post()
  createBlock(@Body() input: BlockInputDto) {
    return this.pagesService.createBlock(input)
  }

  @Patch(':id')
  updateBlock(@Param('id') id: string, @Body() input: BlockInputDto) {
    return this.pagesService.updateBlock(id, input)
  }

  @Delete(':id')
  deleteBlock(@Param('id') id: string) {
    return this.pagesService.deleteBlock(id)
  }

  @Post('reorder')
  reorderBlocks(@Body() orderedBlocks: ReorderBlockDto[]) {
    return this.pagesService.reorderBlocks(orderedBlocks)
  }
}
