import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator'

// Mirrors BlockInput from src/lib/repos/pages.ts. `content` is the block's
// arbitrary JSON payload (shape depends on block_type) and is intentionally
// left untyped here, same as the original.
export class BlockInputDto {
  @IsOptional()
  @IsUUID()
  page_id?: string

  @IsOptional()
  @IsString()
  block_type?: string

  @IsOptional()
  @IsInt()
  sort_order?: number

  @IsOptional()
  content?: unknown

  @IsOptional()
  @IsBoolean()
  is_visible?: boolean

  @IsOptional()
  @IsString()
  label?: string | null
}

export class ReorderBlockDto {
  @IsUUID()
  id!: string

  @IsInt()
  sort_order!: number
}
