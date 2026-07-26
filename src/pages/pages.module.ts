import { Module } from '@nestjs/common'
import { PagesService } from './pages.service'
import { PagesAdminController, BlocksAdminController } from './pages-admin.controller'
import { PagesPublicController } from './pages-public.controller'

@Module({
  controllers: [PagesAdminController, BlocksAdminController, PagesPublicController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
