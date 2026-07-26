import { Module } from '@nestjs/common'
import { PagesModule } from '../pages/pages.module'
import { PostsModule } from '../posts/posts.module'
import { SettingsService } from './settings.service'
import { SettingsAdminController } from './settings-admin.controller'
import { SettingsPublicController } from './settings-public.controller'

@Module({
  imports: [PagesModule, PostsModule],
  controllers: [SettingsAdminController, SettingsPublicController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
