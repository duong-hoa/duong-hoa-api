import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID } from 'class-validator'

// Mirrors PostInput from src/lib/repos/posts.ts.
export class PostInputDto {
  @IsOptional()
  @IsString()
  slug?: string

  @IsOptional()
  title?: unknown

  @IsOptional()
  summary?: unknown

  @IsOptional()
  content?: unknown

  @IsOptional()
  @IsString()
  cover_image?: string | null

  @IsOptional()
  @IsBoolean()
  is_published?: boolean

  @IsOptional()
  @IsDateString()
  published_at?: string

  @IsOptional()
  @IsUUID()
  category_id?: string | null
}

export class DuplicatePostDto {
  @IsString()
  slug!: string

  @IsOptional()
  title?: unknown
}
