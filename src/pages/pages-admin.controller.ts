import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PagesService } from './pages.service'
import { PageInputDto } from './dto/page-input.dto'
import { PageCategoryInputDto } from './dto/page-category-input.dto'
import { BlockInputDto, ReorderBlockDto } from './dto/block-input.dto'
import { AssignBlockLayoutCollectionDto, BlockLayoutCollectionNameDto, CreatePageTemplateDto, PageTemplateCollectionNameDto, RenamePageTemplateDto, UpdatePageTemplateDto, UsePageTemplateDto } from './dto/page-template.dto'

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
@Controller('admin/page-templates')
export class PageTemplatesAdminController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  list() { return this.pagesService.getPageTemplates() }

  @Post()
  create(@Body() input: CreatePageTemplateDto) { return this.pagesService.createPageTemplate(input) }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdatePageTemplateDto) { return this.pagesService.updatePageTemplate(id, input) }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.pagesService.deletePageTemplate(id) }

  @Post(':id/clone')
  clone(@Param('id') id: string, @Body() input: RenamePageTemplateDto) { return this.pagesService.clonePageTemplate(id, input.name) }

  @Post(':id/use')
  use(@Param('id') id: string, @Body() input: UsePageTemplateDto) { return this.pagesService.usePageTemplate(id, input) }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/page-template-collections')
export class PageTemplateCollectionsAdminController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  list() { return this.pagesService.getPageTemplateCollections() }

  @Post()
  create(@Body() input: PageTemplateCollectionNameDto) { return this.pagesService.createPageTemplateCollection(input) }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() input: PageTemplateCollectionNameDto) { return this.pagesService.renamePageTemplateCollection(id, input) }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.pagesService.deletePageTemplateCollection(id) }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/block-layout-collections')
export class BlockLayoutCollectionsAdminController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  list() { return this.pagesService.getBlockLayoutCollections() }

  @Post()
  create(@Body() input: BlockLayoutCollectionNameDto) { return this.pagesService.createBlockLayoutCollection(input) }

  @Patch('assignment')
  assign(@Body() input: AssignBlockLayoutCollectionDto) { return this.pagesService.assignBlockLayoutCollection(input) }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() input: BlockLayoutCollectionNameDto) { return this.pagesService.renameBlockLayoutCollection(id, input) }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.pagesService.deleteBlockLayoutCollection(id) }
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

  @Get('site-candidates')
  siteCandidates() { return this.pagesService.getSiteBlockCandidates() }

  @Get('link-targets')
  linkTargets() { return this.pagesService.getCmsLinkIndex() }

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
