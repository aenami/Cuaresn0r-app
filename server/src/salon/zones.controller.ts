import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { CreateAreaDto } from './dto/area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('/salon/zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createAreaDto: CreateAreaDto) {
    return this.zonesService.create(createAreaDto);
  }

  @Get()
  findAll() {
    return this.zonesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.zonesService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateAreaDto: UpdateAreaDto) {
    return this.zonesService.update(id, updateAreaDto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.zonesService.remove(id);
  }
}
