import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios'; // Importando o Axios

@Injectable()
export class WhatsappService {
  private readonly apiUrl = process.env.EVOLUTION_API_URL;
  private readonly apiKey = process.env.EVOLUTION_API_KEY;
  private readonly instanceName = process.env.EVOLUTION_INSTANCE_NAME;

  async sendText(number: string, text: string) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/message/sendText/${this.instanceName}`,
        {
          number: number,
          text: text,
          delay: 1200, // Atraso para simular digitação
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey, // A chave vai no header 'apikey'
          },
        }
      );

      return response.data;
    } catch (error: any) { // O ': any' resolve o erro "Object is of type unknown"
      throw new HttpException(
        error.response?.data?.message || error.message || 'Erro de comunicação com a Evolution API',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}