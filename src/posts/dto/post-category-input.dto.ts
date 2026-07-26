import { IsInt, IsOptional, IsString } from 'class-validator'

// Mirrors PostCategoryInput from src/lib/repos/posts.ts.
export class PostCategoryInputDto {
  @IsOptional()
  name?: unknown

  @IsOptional()
  @IsString()
  slug?: string | null

  @IsOptional()
  description?: unknown

  @IsOptional()
  @IsInt()
  sort_order?: number
}
