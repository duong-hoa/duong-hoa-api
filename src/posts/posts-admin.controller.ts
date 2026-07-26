import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PostsService } from './posts.service'
import { PostInputDto, DuplicatePostDto } from './dto/post-input.dto'
import { PostCategoryInputDto } from './dto/post-category-input.dto'

// Mirrors the post/post-category admin server actions in src/lib/admin-actions.ts.
@UseGuards(JwtAuthGuard)
@Controller('admin/posts')
export class PostsAdminController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  getAdminPosts() {
    return this.postsService.getAdminPosts()
  }

  @Get('by-slug/:slug')
  getAdminPostBySlug(@Param('slug') slug: string) {
    return this.postsService.getAdminPostBySlug(slug)
  }

  @Get(':id')
  getAdminPostById(@Param('id') id: string) {
    return this.postsService.getAdminPostById(id)
  }

  @Post()
  createPost(@Body() input: PostInputDto) {
    return this.postsService.createPost(input)
  }

  @Patch(':id')
  updatePost(@Param('id') id: string, @Body() input: PostInputDto) {
    return this.postsService.updatePost(id, input)
  }

  @Delete(':id')
  deletePost(@Param('id') id: string) {
    return this.postsService.deletePost(id)
  }

  @Post(':id/duplicate')
  duplicatePost(@Param('id') id: string, @Body() body: DuplicatePostDto) {
    return this.postsService.duplicatePost(id, body.slug, body.title)
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/post-categories')
export class PostCategoriesAdminController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  getPostCategories() {
    return this.postsService.getPostCategories()
  }

  @Post()
  createPostCategory(@Body() input: PostCategoryInputDto) {
    return this.postsService.createPostCategory(input)
  }

  @Patch(':id')
  updatePostCategory(@Param('id') id: string, @Body() input: PostCategoryInputDto) {
    return this.postsService.updatePostCategory(id, input)
  }

  @Delete(':id')
  deletePostCategory(@Param('id') id: string) {
    return this.postsService.deletePostCategory(id)
  }
}
