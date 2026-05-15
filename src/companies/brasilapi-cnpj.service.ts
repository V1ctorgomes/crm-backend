import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { onlyDigits, isValidCnpj } from './companies.validation';

export type CnpjLookupResult = {
  legalName: string;
  /** Sempre preenchido: `nome_fantasia` da API ou, se vazio, a própria razão social. */
  tradeName: string;
  cnpj: string;
};

/** Consulta dados cadastrais por CNPJ (Brasil API). URL base via env `BRASILAPI_CNPJ_BASE_URL`. */
@Injectable()
export class BrasilApiCnpjService {
  private readonly baseUrl: string;

  constructor() {
    const raw = process.env.BRASILAPI_CNPJ_BASE_URL || 'https://brasilapi.com.br/api/cnpj/v1';
    this.baseUrl = raw.replace(/\/+$/, '');
  }

  async lookup(rawCnpj: string): Promise<CnpjLookupResult> {
    const digits = onlyDigits(rawCnpj || '');
    if (digits.length !== 14) {
      throw new HttpException('CNPJ deve ter 14 dígitos.', HttpStatus.BAD_REQUEST);
    }
    if (!isValidCnpj(digits)) {
      throw new HttpException('CNPJ inválido (dígitos verificadores incorrectos).', HttpStatus.BAD_REQUEST);
    }

    const url = `${this.baseUrl}/${digits}`;
    try {
      const res = await axios.get<Record<string, unknown>>(url, {
        timeout: 20_000,
        validateStatus: () => true,
      });

      if (res.status === 404) {
        throw new HttpException('CNPJ não encontrado na base consultada.', HttpStatus.NOT_FOUND);
      }
      if (res.status >= 400 || !res.data || typeof res.data !== 'object') {
        throw new HttpException(
          'Não foi possível consultar o CNPJ no momento. Tente mais tarde.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = res.data;
      const razao = String(data.razao_social ?? '').trim();
      if (!razao) {
        throw new HttpException('Resposta da API de CNPJ incompleta.', HttpStatus.BAD_GATEWAY);
      }

      const fantasiaRaw = String(data.nome_fantasia ?? '').trim();
      const isPlaceholder =
        !fantasiaRaw ||
        /^n[ãa]o\s+informad[oa]$/i.test(fantasiaRaw) ||
        fantasiaRaw === '-' ||
        fantasiaRaw === '***';
      /** Nome fantasia útil; quando a Receita não informa, repetimos a razão para o formulário não ficar vazio. */
      const tradeName = isPlaceholder ? razao : fantasiaRaw;
      const cnpjResp = onlyDigits(String(data.cnpj ?? digits));

      return {
        legalName: razao,
        tradeName,
        cnpj: cnpjResp.length === 14 ? cnpjResp : digits,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException(
        'Erro ao ligar ao serviço de consulta de CNPJ.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
