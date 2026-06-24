import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappEvolutionCredentialsService } from './whatsapp-evolution-credentials.service';
import {
  normalizeStoredContactKey,
  sanitizeWhatsAppGroupSubject,
  shouldReplaceAutoGroupDisplayName,
} from './whatsapp-contact-jid.util';

@Injectable()
export class WhatsappGroupSubjectService {
  constructor(
    private readonly creds: WhatsappEvolutionCredentialsService,
    private readonly prisma: PrismaService,
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private collectGroupSubjectStringsFromTree(obj: unknown, maxDepth = 8, depth = 0): string[] {
    if (depth > maxDepth || obj == null) return [];
    if (typeof obj === 'string') return [];
    if (Array.isArray(obj)) {
      const acc: string[] = [];
      for (const item of obj) acc.push(...this.collectGroupSubjectStringsFromTree(item, maxDepth, depth + 1));
      return acc;
    }
    if (typeof obj !== 'object') return [];
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === 'subject' && typeof v === 'string') out.push(v);
      else if (v && (typeof v === 'object' || Array.isArray(v))) {
        out.push(...this.collectGroupSubjectStringsFromTree(v, maxDepth, depth + 1));
      }
    }
    return out;
  }

  private pickSanitizedGroupSubject(gj: string, ...buckets: unknown[]): string | undefined {
    const seen = new Set<string>();
    for (const b of buckets) {
      const fromTree = this.collectGroupSubjectStringsFromTree(b);
      const flat: unknown[] = [];
      if (b && typeof b === 'object' && !Array.isArray(b)) {
        const o = b as Record<string, unknown>;
        flat.push(o.subject, o.groupSubject, o.groupName);
        const data = o.data;
        if (data && typeof data === 'object') {
          const inner = data as Record<string, unknown>;
          flat.push(inner.subject, inner.groupSubject);
        }
        const chat = o.chat;
        if (chat && typeof chat === 'object') {
          flat.push((chat as Record<string, unknown>).subject);
        }
        const meta = o.groupMetadata;
        if (meta && typeof meta === 'object') {
          flat.push((meta as Record<string, unknown>).subject);
        }
      }
      for (const raw of [...flat, ...fromTree]) {
        if (raw === undefined || raw === null) continue;
        const s = typeof raw === 'string' ? raw : String(raw);
        const sanitized = sanitizeWhatsAppGroupSubject(s, gj);
        if (sanitized && !seen.has(sanitized.toLowerCase())) {
          seen.add(sanitized.toLowerCase());
          return sanitized;
        }
      }
    }
    return undefined;
  }

  async tryFetchGroupSubjectOnce(instanceName: string, groupJid: string): Promise<string | undefined> {
    const gj = normalizeStoredContactKey(groupJid);
    const { baseUrl, apiKey } = await this.creds.get();
    const inst = encodeURIComponent(instanceName);
    const headers = { apikey: apiKey };

    const tryAxios = async (fn: () => Promise<{ data: unknown }>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };

    const findRes = await tryAxios(() =>
      axios.get(`${baseUrl}/group/findGroupInfos/${inst}`, {
        params: { groupJid: gj },
        headers,
      }),
    );
    if (findRes?.data) {
      const picked = this.pickSanitizedGroupSubject(gj, findRes.data);
      if (picked) return picked;
    }

    let partRes: { data: unknown } | null = await tryAxios(() =>
      axios.get(`${baseUrl}/group/participants/${inst}`, {
        params: { groupJid: gj },
        headers,
      }),
    );
    if (!partRes) {
      partRes = await tryAxios(() =>
        axios.post(
          `${baseUrl}/group/participants/${inst}`,
          { groupJid: gj },
          { headers: { ...headers, 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (partRes?.data) {
      return this.pickSanitizedGroupSubject(gj, partRes.data);
    }
    return undefined;
  }

  async tryFetchGroupSubject(
    instanceName: string,
    groupJid: string,
    opts?: { retries?: number },
  ): Promise<string | undefined> {
    const retries = Math.min(Math.max(Number(opts?.retries ?? 0), 0), 4);
    const delayMs = 750;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await this.sleep(delayMs);
      const got = await this.tryFetchGroupSubjectOnce(instanceName, groupJid);
      if (got) return got;
    }
    return undefined;
  }

  async retryResolveGroupSubjectIfPlaceholder(userId: string, instanceName: string, groupJid: string) {
    try {
      const row = await this.prisma.contact.findUnique({
        where: { number_userId: { number: groupJid, userId } },
        select: { name: true },
      });
      if (!row || !shouldReplaceAutoGroupDisplayName(row.name, groupJid)) return;
      const subject = await this.tryFetchGroupSubject(instanceName, groupJid, { retries: 2 });
      if (!subject) return;
      await this.prisma.contact.update({
        where: { number_userId: { number: groupJid, userId } },
        data: { name: subject },
      });
    } catch {
      /* ignore */
    }
  }

  shouldReplaceAutoGroupDisplayName = shouldReplaceAutoGroupDisplayName;
}
