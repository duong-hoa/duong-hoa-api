import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'

export class TranslateTextDto {
  @IsString()
  text!: string

  @IsString()
  fromLang!: string

  @IsString()
  toLang!: string

  @IsOptional()
  @IsIn(['google', 'gemini'])
  engine?: 'google' | 'gemini'
}

export class TranslateHtmlDto extends TranslateTextDto {}

export class TranslateBatchDto {
  @IsArray()
  @IsString({ each: true })
  texts!: string[]

  @IsString()
  fromLang!: string

  @IsString()
  toLang!: string

  @IsOptional()
  @IsBoolean()
  isHTML?: boolean

  @IsOptional()
  @IsIn(['google', 'gemini'])
  engine?: 'google' | 'gemini'
}

export class TranslateContentDto {
  @IsString()
  fromLang!: string

  @IsOptional()
  @IsIn(['google', 'gemini'])
  engine?: 'google' | 'gemini'

  // The block/page content object to translate — arbitrary JSON, same as
  // translateContentObject()'s `content` parameter in src/lib/auto-translate.ts.
  content!: Record<string, unknown>
}
