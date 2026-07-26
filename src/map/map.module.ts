import { Module } from '@nestjs/common'
import { PagesModule } from '../pages/pages.module'
import { MapService } from './map.service'
import { MapAdminController } from './map-admin.controller'
import { MapPublicController } from './map-public.controller'

@Module({
  imports: [PagesModule],
  controllers: [MapAdminController, MapPublicController],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
