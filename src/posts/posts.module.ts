import { Module } from '@nestjs/common'
import { PostsService } from './posts.service'
import { PostsAdminController, PostCategoriesAdminController } from './posts-admin.controller'
import { PostsPublicController } from './posts-public.controller'

@Module({
  controllers: [PostsAdminController, PostCategoriesAdminController, PostsPublicController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
