import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TicketCatalogService } from './ticket-catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { isTicketCatalogCategory } from './ticket-catalog.constants';

@Controller('ticket-catalog')
export class TicketCatalogController {
  constructor(private readonly catalog: TicketCatalogService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'USER', 'DEVELOPER')
  getOptions() {
    return this.catalog.getActiveOptionsGrouped();
  }

  @Get('manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DEVELOPER')
  listManage() {
    return this.catalog.listAllForManage();
  }

  @Post('manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DEVELOPER')
  createManage(@Body() body: { category?: string; label?: string }) {
    const cat = String(body.category || '');
    if (!isTicketCatalogCategory(cat)) {
      throw new HttpException('Categoria inválida.', HttpStatus.BAD_REQUEST);
    }
    return this.catalog.createItem(cat, String(body.label || ''));
  }

  @Patch('manage/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DEVELOPER')
  patchManage(
    @Param('id') id: string,
    @Body() body: { label?: string; isActive?: boolean; sortOrder?: number },
  ) {
    return this.catalog.updateItem(id, body);
  }

  @Delete('manage/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DEVELOPER')
  deleteManage(@Param('id') id: string) {
    return this.catalog.deleteItem(id);
  }
}
