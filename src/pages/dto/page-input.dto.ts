import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator'

// Mirrors PageInput from src/lib/repos/pages.ts. title/description/sub_nav
// are arbitrary JSON blobs (localized text maps / anchor-menu arrays) so
// they're intentionally left untyped here, same as the original.
export class PageInputDto {
  @IsOptional()
  @IsString()
  slug?: string

  @IsOptional()
  title?: unknown

  @IsOptional()
  description?: unknown

  @IsOptional()
  @IsString()
  seo_image?: string | null

  @IsOptional()
  @IsString()
  audio_url?: string | null

  @IsOptional()
  @IsBoolean()
  is_published?: boolean

  @IsOptional()
  @IsInt()
  sort_order?: number

  @IsOptional()
  sub_nav?: unknown
}
