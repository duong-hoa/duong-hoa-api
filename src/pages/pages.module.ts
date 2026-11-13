import { Module } from '@nestjs/common'
import { PagesService } from './pages.service'
import { PagesAdminController, BlocksAdminController, PageCategoriesAdminController, PageTemplateCollectionsAdminController, PageTemplatesAdminController } from './pages-admin.controller'
import { PagesPublicController } from './pages-public.controller'

@Module({
  controllers: [PagesAdminController, BlocksAdminController, PageCategoriesAdminController, PageTemplatesAdminController, PageTemplateCollectionsAdminController, PagesPublicController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
