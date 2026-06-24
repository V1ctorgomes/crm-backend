import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketCompanyResolverService {
  constructor(private prisma: PrismaService) {}

  /**
   * Regras de companyId na criação de OS:
   * - 0 empresas ligadas ao contacto: companyId tem de vir vazio.
   * - 1 empresa ligada: usa-se essa (mesmo que body não a indique); se body indicar, tem de coincidir.
   * - >1 empresas ligadas: body **tem** de indicar companyId e ele tem de estar ligado ao contacto.
   */
  async resolveCompanyForTicket(userId: string, contactNumber: string, requestedId: string | null): Promise<string | null> {
    const links = await this.prisma.contactCompany.findMany({
      where: { userId, contactNumber },
      select: { companyId: true },
    });
    const linkedIds = links.map((l) => l.companyId);

    if (linkedIds.length === 0) {
      if (requestedId) {
        throw new HttpException(
          'Este contacto ainda não tem empresas associadas. Associe uma empresa em Contatos antes de criar a OS.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return null;
    }

    if (linkedIds.length === 1) {
      const only = linkedIds[0];
      if (requestedId && requestedId !== only) {
        throw new HttpException('A empresa indicada não está ligada a este contacto.', HttpStatus.BAD_REQUEST);
      }
      return only;
    }

    if (!requestedId) {
      throw new HttpException(
        'Este contacto tem várias empresas associadas. Seleccione qual é a solicitante desta OS.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!linkedIds.includes(requestedId)) {
      throw new HttpException('A empresa indicada não está ligada a este contacto.', HttpStatus.BAD_REQUEST);
    }
    return requestedId;
  }
}
