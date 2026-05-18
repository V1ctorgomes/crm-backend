import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { BrasilApiCnpjService } from './brasilapi-cnpj.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

function actorFromReq(req: { user: { userId: string; email: string; role: string } }) {
  return { userId: req.user.userId, email: req.user.email, role: req.user.role };
}

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'USER')
export class CompaniesController {
  constructor(
    private readonly service: CompaniesService,
    private readonly brasilApiCnpj: BrasilApiCnpjService,
  ) {}

  @Get()
  list(@Req() req: any, @Query('search') search?: string) {
    return this.service.list(req.user.userId, search);
  }

  @Get('contact/:number')
  listForContact(@Req() req: any, @Param('number') number: string) {
    return this.service.listForContact(req.user.userId, number);
  }

  /** Consulta Razão Social / Nome Fantasia na Brasil API (URL base em BRASILAPI_CNPJ_BASE_URL). */
  @Get('lookup/cnpj/:cnpj')
  lookupCnpj(@Param('cnpj') cnpj: string) {
    return this.brasilApiCnpj.lookup(cnpj);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.service.getOne(req.user.userId, id);
  }

  @Post()
  create(@Req() req: any, @Body() body: { legalName: string; tradeName?: string; cnpj: string }) {
    return this.service.create(req.user.userId, body);
  }

  @Put(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { legalName?: string; tradeName?: string; cnpj?: string },
  ) {
    return this.service.update(req.user.userId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.service.remove(req.user.userId, id, actorFromReq(req), body?.reason);
  }

  @Post(':id/contacts/:number')
  link(@Req() req: any, @Param('id') id: string, @Param('number') number: string) {
    return this.service.linkContact(req.user.userId, id, number);
  }

  @Delete(':id/contacts/:number')
  unlink(@Req() req: any, @Param('id') id: string, @Param('number') number: string, @Body() body?: { reason?: string }) {
    return this.service.unlinkContact(req.user.userId, id, number, actorFromReq(req), body?.reason);
  }
}
