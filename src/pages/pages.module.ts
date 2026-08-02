import { Module } from '@nestjs/common'
import { PagesService } from './pages.service'
import { PagesAdminController, BlocksAdminController, PageCategoriesAdminController } from './pages-admin.controller'
import { PagesPublicController } from './pages-public.controller'

@Module({
  controllers: [PagesAdminController, BlocksAdminController, PageCategoriesAdminController, PagesPublicController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
