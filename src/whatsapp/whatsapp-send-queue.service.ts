import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  computeBackoffMs,
  getSendMaxPerMinute,
  getSendMaxRetries,
  getSendMinIntervalMs,
  isSendQueueEnabled,
  SEND_RATE_WINDOW_MS,
} from './whatsapp-send-policy.util';
import { isEvolutionRateLimitError } from './whatsapp-evolution-error.util';

@Injectable()
export class WhatsappSendQueueService {
  private readonly logger = new Logger(WhatsappSendQueueService.name);
  /** Cadeia de envios por instância (um de cada vez). */
  private readonly tails = new Map<string, Promise<unknown>>();
  /** Timestamps de envios iniciados na janela. */
  private readonly sendTimestamps = new Map<string, number[]>();
  /** Fim do último envio por instância (espaçamento mínimo). */
  private readonly lastSendFinishedAt = new Map<string, number>();

  /**
   * Executa o envio à Evolution em fila por instância, com limite por minuto e novas tentativas com espera.
   */
  async runForInstance<T>(instanceName: string, fn: () => Promise<T>): Promise<T> {
    const key = instanceName.trim();
    if (!key) {
      return fn();
    }
    if (!isSendQueueEnabled()) {
      await this.awaitMinInterval(key);
      this.assertRateLimit(key);
      try {
        const result = await this.runWithBackoff(fn, key);
        this.markSendFinished(key);
        return result;
      } catch (e) {
        this.markSendFinished(key);
        throw e;
      }
    }

    const prev = this.tails.get(key) ?? Promise.resolve();
    const job = prev
      .catch(() => {
        /* mantém a fila mesmo se o envio anterior falhou */
      })
      .then(async () => {
        await this.awaitMinInterval(key);
        this.assertRateLimit(key);
        this.recordSendStart(key);
        try {
          return await this.runWithBackoff(fn, key);
        } finally {
          this.markSendFinished(key);
        }
      });

    this.tails.set(
      key,
      job.catch(() => {
        /* evita rejeição não tratada na cadeia */
      }),
    );
    return job as Promise<T>;
  }

  private async runWithBackoff<T>(fn: () => Promise<T>, instanceName: string): Promise<T> {
    const maxRetries = getSendMaxRetries();
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const canRetry = attempt < maxRetries && isEvolutionRateLimitError(err);
        if (!canRetry) {
          throw err;
        }
        const waitMs = computeBackoffMs(attempt);
        this.logger.warn(
          `Evolution pediu calma (${instanceName}); nova tentativa em ${waitMs}ms (${attempt + 1}/${maxRetries})`,
        );
        await this.sleep(waitMs);
      }
    }
    throw lastErr;
  }

  private assertRateLimit(instanceName: string): void {
    const max = getSendMaxPerMinute();
    const now = Date.now();
    const list = (this.sendTimestamps.get(instanceName) ?? []).filter((t) => t > now - SEND_RATE_WINDOW_MS);
    if (list.length >= max) {
      throw new HttpException(
        `Limite de ${max} mensagens por minuto nesta linha WhatsApp. Aguarde alguns segundos antes de enviar outra.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async awaitMinInterval(instanceName: string): Promise<void> {
    const minMs = getSendMinIntervalMs();
    if (minMs <= 0) return;
    const last = this.lastSendFinishedAt.get(instanceName);
    if (last == null) return;
    const wait = last + minMs - Date.now();
    if (wait > 0) {
      await this.sleep(wait);
    }
  }

  private markSendFinished(instanceName: string): void {
    this.lastSendFinishedAt.set(instanceName, Date.now());
  }

  private recordSendStart(instanceName: string): void {
    const now = Date.now();
    const list = (this.sendTimestamps.get(instanceName) ?? []).filter(
      (t) => t > now - SEND_RATE_WINDOW_MS,
    );
    list.push(now);
    this.sendTimestamps.set(instanceName, list);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
