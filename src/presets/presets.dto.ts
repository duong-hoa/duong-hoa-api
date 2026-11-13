import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator'

export class CreatePresetDto {
  @IsIn(['block', 'page'])
  kind!: 'block' | 'page'

  @IsString()
  @Length(1, 240)
  scope!: string

  @IsString()
  @Length(1, 150)
  name!: string

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>

  @IsOptional()
  @IsUUID()
  group_id?: string | null

  @IsOptional()
  @IsUUID()
  source_page_id?: string
}

export class UpdatePresetDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>

  @IsOptional()
  @IsUUID()
  group_id?: string | null

  @IsOptional()
  @IsUUID()
  source_page_id?: string
}

export class ActivatePresetDto {
  @IsIn(['scope', 'new-pages', 'both'])
  target!: 'scope' | 'new-pages' | 'both'
}

export class CreatePresetGroupDto {
  @IsIn(['block', 'page'])
  kind!: 'block' | 'page'

  @IsString()
  @Length(1, 150)
  name!: string
}

export class RenamePresetGroupDto {
  @IsString()
  @Length(1, 150)
  name!: string
}

export class AssignPresetGroupDto {
  @IsOptional()
  @IsUUID()
  group_id?: string | null
}

export class ResetPresetSelectionDto {
  @IsIn(['block', 'page'])
  kind!: 'block' | 'page'

  @IsString()
  @Length(1, 240)
  scope!: string
}

export class CreatePageFromPresetDto {
  @IsString()
  @Length(1, 150)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  slug!: string

  @IsOptional()
  @IsObject()
  title?: Record<string, unknown>

  @IsOptional()
  @IsInt()
  sort_order?: number

  @IsOptional()
  @IsUUID()
  category_id?: string | null

  @IsOptional()
  @IsUUID()
  source_template_id?: string
}
