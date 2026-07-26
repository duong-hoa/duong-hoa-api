import { IsInt, IsOptional, IsString } from 'class-validator'

// Mirrors the `media` table columns. This table exists in the schema but
// currently has zero call-sites anywhere in the Next.js app (uploads are
// tracked purely as object-storage paths embedded directly in page/post
// JSON content) — included here for full schema parity.
export class MediaInputDto {
  @IsString()
  filename!: string

  @IsString()
  storage_path!: string

  @IsString()
  url!: string

  @IsOptional()
  @IsString()
  alt_vi?: string | null

  @IsOptional()
  @IsString()
  alt_en?: string | null

  @IsOptional()
  @IsString()
  file_type?: string

  @IsOptional()
  @IsInt()
  width?: number | null

  @IsOptional()
  @IsInt()
  height?: number | null

  @IsOptional()
  @IsInt()
  file_size?: number | null
}
