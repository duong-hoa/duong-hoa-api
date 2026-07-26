import { Controller, Get, Param, Query } from '@nestjs/common'
import { PostsService } from './posts.service'

// Mirrors the published-post/category reads exported from
// src/lib/repos/public-cms.ts and re-exported via src/lib/cms.ts.
@Controller('public')
export class PostsPublicController {
  constructor(private readonly postsService: PostsService) {}

  @Get('posts')
  getPosts(@Query('locale') locale?: string) {
    return this.postsService.getPublishedPosts(locale || 'vi')
  }

  @Get('posts/category/:slug')
  getPostsByCategory(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.postsService.getPublishedPostsByCategory(slug, locale || 'vi')
  }

  @Get('posts/:slug')
  getPostBySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.postsService.getPublishedPostBySlug(slug, locale || 'vi')
  }

  @Get('post-categories')
  getPostCategories(@Query('locale') locale?: string) {
    return this.postsService.getPublishedPostCategories(locale || 'vi')
  }

  @Get('post-categories/full')
  getPostCategoriesFull(@Query('locale') locale?: string) {
    return this.postsService.getPublishedPostCategoriesFull(locale || 'vi')
  }
}
