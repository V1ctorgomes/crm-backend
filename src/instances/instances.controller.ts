import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { InstancesService } from './instances.service';

@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  /**
   * Lista todas as instâncias de um utilizador específico.
   * Útil para o isolamento de dados no Frontend.
   */
  @Get('user/:userId')
  async findByUser(@Param('userId') userId: string) {
    return this.instancesService.findByUser(userId);
  }

  /**
   * Cria uma nova instância na Evolution API e no Banco de Dados.
   * Já inclui a lógica de configuração automática de Webhook e Proxy.
   */
  @Post()
  async create(@Body() body: any) {
    return this.instancesService.create(body);
  }

  /**
   * Obtém o QR Code (Base64) para conexão de uma instância.
   */
  @Get(':name/qrcode')
  async getQrCode(@Param('name') name: string) {
    return this.instancesService.getQrCode(name);
  }

  /**
   * Consulta o estado atual da conexão (connected, disconnected, etc).
   */
  @Get(':name/status')
  async checkStatus(@Param('name') name: string) {
    return this.instancesService.checkStatus(name);
  }

  /**
   * Atualiza as configurações de comportamento da instância.
   * Ex: Rejeitar chamadas ou ignorar grupos.
   */
  @Put(':name')
  async updateSettings(
    @Param('name') name: string, 
    @Body() body: { rejectCalls: boolean; ignoreGroups: boolean }
  ) {
    return this.instancesService.updateSettings(name, body);
  }

  /**
   * Remove a instância do banco de dados e da Evolution API.
   * Efetua o logout automático do WhatsApp.
   */
  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('name') name: string) {
    return this.instancesService.remove(name);
  }
}