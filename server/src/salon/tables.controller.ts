import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/mesa.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { EstadoMesa } from '../generated/prisma/client';

@Controller('/salon/tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createTableDto: CreateTableDto) {
    return this.tablesService.create(createTableDto);
  }

  @Get()
  findAll(@Query('zona') zona?: string, @Query('estado') estado?: EstadoMesa) {
    return this.tablesService.findAll(zona !== undefined ? Number(zona) : undefined, estado);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateTableDto: UpdateTableDto) {
    return this.tablesService.update(id, updateTableDto);
  }

  @Patch(':id/reserve')
  reserve(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.reserve(id);
  }

  @Patch(':id/release')
  release(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.release(id);
  }

  @Roles('ADMIN')
  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.deactivate(id);
  }

  @Roles('ADMIN')
  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.activate(id);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tablesService.deactivate(id);
  }
}
