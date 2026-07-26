import { Controller, Get } from '@nestjs/common'
import { MapService } from './map.service'

// Mirrors src/lib/public-actions.ts:getPublicMapData / repos/map.ts:getPublicMapLocations.
@Controller('public/map')
export class MapPublicController {
  constructor(private readonly mapService: MapService) {}

  @Get('locations')
  getPublicMapLocations() {
    return this.mapService.getPublicMapLocations()
  }
}
