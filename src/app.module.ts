import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
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
