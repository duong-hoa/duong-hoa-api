import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator'

// Mirrors MapLocationInput from src/lib/repos/map.ts.
export class MapLocationInputDto {
  @IsOptional()
  name?: unknown

  @IsOptional()
  description?: unknown

  @IsOptional()
  @IsNumber()
  lat?: number

  @IsOptional()
  @IsNumber()
  lng?: number

  @IsOptional()
  @IsString()
  icon_color?: string

  @IsOptional()
  @IsInt()
  sort_order?: number

  @IsOptional()
  @IsBoolean()
  is_published?: boolean

  @IsOptional()
  @IsString()
  google_maps_url?: string | null

  @IsOptional()
  @IsUUID()
  category_id?: string | null

  @IsOptional()
  @IsUUID()
  page_id?: string | null
}

export class LocationCategoryInputDto {
  @IsOptional()
  name?: unknown
}
