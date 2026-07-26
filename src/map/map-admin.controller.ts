import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { MapService } from './map.service'
import { MapLocationInputDto, LocationCategoryInputDto } from './dto/map-location-input.dto'

// Mirrors the map/location-category admin server actions in src/lib/admin-actions.ts.
@UseGuards(JwtAuthGuard)
@Controller('admin/map')
export class MapAdminController {
  constructor(private readonly mapService: MapService) {}

  @Get()
  getAdminMapData() {
    return this.mapService.getAdminMapData()
  }

  @Post('locations')
  createMapLocation(@Body() input: MapLocationInputDto) {
    return this.mapService.createMapLocation(input)
  }

  @Patch('locations/:id')
  updateMapLocation(@Param('id') id: string, @Body() input: MapLocationInputDto) {
    return this.mapService.updateMapLocation(id, input)
  }

  @Delete('locations/:id')
  deleteMapLocation(@Param('id') id: string) {
    return this.mapService.deleteMapLocation(id)
  }

  @Get('categories')
  getLocationCategories() {
    return this.mapService.getLocationCategories()
  }

  @Post('categories')
  createLocationCategory(@Body() input: LocationCategoryInputDto) {
    return this.mapService.createLocationCategory(input)
  }

  @Patch('categories/:id')
  updateLocationCategory(@Param('id') id: string, @Body() input: LocationCategoryInputDto) {
    return this.mapService.updateLocationCategory(id, input)
  }

  @Delete('categories/:id')
  deleteLocationCategory(@Param('id') id: string) {
    return this.mapService.deleteLocationCategory(id)
  }
}
