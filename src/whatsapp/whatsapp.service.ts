import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  async sendText(number: string, text: string) {
    // Puxa as variáveis e limpa espaços vazios ou barras acidentais
    const apiUrl = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/$/, '');
    const apiKey = (process.env.EVOLUTION_API_KEY || '').trim();
    const instanceName = (process.env.EVOLUTION_INSTANCE_NAME || '').trim();

    // Remove qualquer coisa que não seja número (ex: +, -, espaços)
    const cleanNumber = number.replace(/\D/g, '');
    const endpoint = `${apiUrl}/message/sendText/${instanceName}`;

    console.log('\n--- 🔴 INICIANDO TENTATIVA DE ENVIO ---');
    console.log(`📍 Destino (Endpoint): ${endpoint}`);
    console.log(`📱 Número Formatado: ${cleanNumber}`);
    console.log(`🔑 Tamanho da API Key: ${apiKey.length} caracteres`);

    try {
      const response = await axios.post(
        endpoint,
        {
          number: cleanNumber,
          text: text
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
          }
        }
      );

      console.log('✅ SUCESSO! A Evolution aceitou a mensagem.');
      console.log('--- FIM DA TENTATIVA ---\n');
      
      return response.data;
      
    } catch (error: any) {
      console.log('❌ FALHA NA EVOLUTION API. Motivo exato:');
      
      // Isto vai imprimir o erro exato que a Evolution está a devolver!
      const erroExato = error.response?.data || error.message;
      console.dir(erroExato, { depth: null, colors: true });
      console.log('--- FIM DA TENTATIVA ---\n');

      throw new HttpException(
        error.response?.data?.message || 'Falha na Evolution API',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}