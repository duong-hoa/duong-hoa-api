import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator'

export class SaveAccountDto {
  @IsOptional()
  @IsString()
  id?: string

  @IsEmail()
  email!: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string

  @IsString()
  displayName!: string

  @IsIn(['admin', 'edit'])
  role!: 'admin' | 'edit'
}
