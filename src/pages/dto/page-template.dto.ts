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

export class UsePageTemplateDto {
  @IsString()
  @Length(1, 150)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  slug!: string

  @IsOptional()
  title?: unknown
}
