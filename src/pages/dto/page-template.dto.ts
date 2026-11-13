import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator'
import { BlockInputDto } from './block-input.dto'

export class CreatePageTemplateDto {
  @IsString()
  @Length(1, 150)
  name!: string

  @IsOptional()
  @IsUUID()
  source_page_id?: string

  @IsOptional()
  @IsUUID()
  collection_id?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BlockInputDto)
  blocks?: BlockInputDto[]
}

export class RenamePageTemplateDto {
  @IsString()
  @Length(1, 150)
  name!: string
}

export class UpdatePageTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string

  @IsOptional()
  @IsUUID()
  collection_id?: string | null
}

export class PageTemplateCollectionNameDto {
  @IsString()
  @Length(1, 150)
  name!: string
}

export class BlockLayoutCollectionNameDto {
  @IsString()
  @Length(1, 150)
  name!: string
}

export class AssignBlockLayoutCollectionDto {
  @IsString()
  @Length(1, 300)
  scope!: string

  @IsString()
  @Length(1, 100)
  block_type!: string

  @IsOptional()
  @IsUUID()
  collection_id?: string | null
}

export class UsePageTemplateDto {
  @IsString()
  @Length(1, 150)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  slug!: string

  @IsOptional()
  title?: unknown
}
