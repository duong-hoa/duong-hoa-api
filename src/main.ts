import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors()
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  )

  const port = process.env.PORT ? Number(process.env.PORT) : 4000
  await app.listen(port, '0.0.0.0')
  console.log(`DKAS backend listening on port ${port}`)
}

bootstrap()
