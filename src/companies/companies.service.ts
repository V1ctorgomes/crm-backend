import { Injectable } from '@nestjs/common';
import type { CompanyInput } from './companies.validation';
import type { AuditActor } from '../deletion-audit/delete-reason.util';
import { CompanyCrudService } from './company-crud.service';
import { CompanyContactsService } from './company-contacts.service';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly crud: CompanyCrudService,
    private readonly contacts: CompanyContactsService,
  ) {}

  list(userId: string, search?: string) {
    return this.crud.list(userId, search);
  }

  getOne(userId: string, id: string) {
    return this.crud.getOne(userId, id);
  }

  create(userId: string, data: CompanyInput) {
    return this.crud.create(userId, data);
  }

  update(userId: string, id: string, data: CompanyInput) {
    return this.crud.update(userId, id, data);
  }

  remove(userId: string, id: string, actor: AuditActor, rawReason?: string) {
    return this.crud.remove(userId, id, actor, rawReason);
  }

  linkContact(userId: string, companyId: string, number: string) {
    return this.contacts.linkContact(userId, companyId, number);
  }

  unlinkContact(userId: string, companyId: string, number: string, actor: AuditActor, rawReason?: string) {
    return this.contacts.unlinkContact(userId, companyId, number, actor, rawReason);
  }

  listForContact(userId: string, number: string) {
    return this.contacts.listForContact(userId, number);
  }
}
