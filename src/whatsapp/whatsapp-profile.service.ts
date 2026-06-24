import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';

@Injectable()
export class WhatsappProfileService {
  constructor(private readonly creds: WhatsappEvolutionCredentialsService) {}

  async fetchProfilePicture(number: string, instanceName: string): Promise<string | undefined> {
    try {
      const { baseUrl, apiKey } = await this.creds.get();
      const response = await axios.post(
        `${baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
        { number },
        { headers: { apikey: apiKey } },
      );
      return response.data?.profilePictureUrl || undefined;
    } catch {
      return undefined;
    }
  }
}
