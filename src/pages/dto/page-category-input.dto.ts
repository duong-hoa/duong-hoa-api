import { IsInt, IsOptional } from 'class-validator'

// Mirrors PageCategoryInput — name is an arbitrary { vi, en, ru, zh } JSON
// blob, intentionally left untyped like every other localized-text field.
export class PageCategoryInputDto {
  @IsOptional()
  name?: unknown

  @IsOptional()
  @IsInt()
  sort_order?: number
}
