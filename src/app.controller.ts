import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      message: 'Backend funcionando!',
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'crm-backend',
    };
  }
}