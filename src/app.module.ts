import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join, resolve } from 'path'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { PagesModule } from './pages/pages.module'
import { PostsModule } from './posts/posts.module'
import { MapModule } from './map/map.module'
import { SettingsModule } from './settings/settings.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { ActivityLogsModule } from './activity-logs/activity-logs.module'
import { AccountsModule } from './accounts/accounts.module'
import { MediaModule } from './media/media.module'
import { StorageModule } from './storage/storage.module'
import { TranslateModule } from './translate/translate.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Publicly serves whatever LocalStorageService (src/storage) writes to
    // disk — same directory, so an upload is reachable at
    // `<backend origin>/uploads/<path>` right after it's saved.
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: resolve(config.get<string>('UPLOADS_DIR') || join(process.cwd(), 'uploads')),
          serveRoot: '/uploads',
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    PagesModule,
    PostsModule,
    MapModule,
    SettingsModule,
    AnalyticsModule,
    ActivityLogsModule,
    AccountsModule,
    MediaModule,
    StorageModule,
    TranslateModule,
  ],
})
export class AppModule {}
