import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { CombosService } from './combos.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('/catalog/combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createComboDto: CreateComboDto) {
    return this.combosService.create(createComboDto);
  }

  @Get()
  findAll(@Query('activo') activo?: string) {
    return this.combosService.findAll(activo === undefined ? undefined : activo === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.combosService.findOne(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateComboDto: UpdateComboDto) {
    return this.combosService.update(id, updateComboDto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.combosService.remove(id);
  }

  @Roles('ADMIN')
  @Patch(':id/enable')
  enable(@Param('id', ParseIntPipe) id: number) {
    return this.combosService.enable(id);
  }
}
