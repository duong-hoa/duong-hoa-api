import { IsIn, IsOptional, IsString } from 'class-validator'

// Mirrors the saveAccount() parameter shape from src/lib/admin-actions.ts.
export class SaveAccountDto {
  @IsOptional()
  @IsString()
  id?: string

  @IsString()
  email!: string

  @IsOptional()
  @IsString()
  password?: string

  @IsString()
  displayName!: string

  @IsIn(['admin', 'edit'])
  role!: 'admin' | 'edit'
}
