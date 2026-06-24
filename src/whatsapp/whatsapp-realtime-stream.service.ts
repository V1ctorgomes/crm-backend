import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class WhatsappRealtimeStreamService {
  private readonly messageSubject = new Subject<Record<string, unknown>>();
  readonly messageStream$ = this.messageSubject.asObservable();

  emit(payload: Record<string, unknown>): void {
    this.messageSubject.next(payload);
  }
}
