import { Module } from '@nestjs/common'
import { PagesService } from './pages.service'
import { PagesAdminController, BlocksAdminController, BlockLayoutCollectionsAdminController, PageCategoriesAdminController, PageTemplateCollectionsAdminController, PageTemplatesAdminController } from './pages-admin.controller'
import { PagesPublicController } from './pages-public.controller'

@Module({
  controllers: [PagesAdminController, BlocksAdminController, BlockLayoutCollectionsAdminController, PageCategoriesAdminController, PageTemplatesAdminController, PageTemplateCollectionsAdminController, PagesPublicController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
