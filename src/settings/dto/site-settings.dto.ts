import { IsOptional } from 'class-validator'

// Mirrors SiteSettings from src/lib/repos/settings.ts. Every field is an
// arbitrary JSON blob (localized text map, list, etc.) and is intentionally
// left untyped here, same as the original — setAdminSettings just loops over
// whatever keys are present and upserts each one.
export class SiteSettingsDto {
  @IsOptional()
  site_title?: unknown

  @IsOptional()
  site_description?: unknown

  @IsOptional()
  contact_email?: unknown

  @IsOptional()
  social_links?: unknown

  @IsOptional()
  enabled_languages?: unknown

  @IsOptional()
  show_blog?: unknown
}
