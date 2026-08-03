import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator'

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
  // Needs at least one class-validator decorator, or NestJS's global
  // ValidationPipe({ whitelist: true }) silently strips this property
  // entirely before the controller ever sees it — every /admin/translate/content
  // call was returning `{}` because of exactly this (every other DTO with an
  // untyped JSON-blob field has at least a bare @IsOptional(), which was the
  // difference that kept them working).
  @IsObject()
  content!: Record<string, unknown>
}
