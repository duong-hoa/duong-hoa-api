import { Module } from '@nestjs/common'
import { PagesModule } from '../pages/pages.module'
import { PresetsModule } from '../presets/presets.module'
import { CmsMcpAuth } from './cms-mcp-auth'
import { CmsAgentReviewController, CmsMcpController } from './cms-mcp.controller'
import { CmsMcpService } from './cms-mcp.service'

@Module({
  imports: [PagesModule, PresetsModule],
  controllers: [CmsMcpController, CmsAgentReviewController],
  providers: [CmsMcpAuth, CmsMcpService],
})
export class CmsMcpModule {}
