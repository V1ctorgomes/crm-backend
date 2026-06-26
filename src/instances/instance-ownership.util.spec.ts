import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertInstanceOwned, assertInstanceUserIdParam } from './instance-ownership.util';

describe('instance-ownership.util', () => {
  const inst = {
    id: '1',
    name: 'linha-1',
    userId: 'user-a',
    status: 'disconnected',
    rejectCalls: false,
    ignoreGroups: false,
    proxyHost: null,
    proxyPort: null,
    proxyUser: null,
    proxyPass: null,
    proxyProto: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('rejeita userId diferente', () => {
    expect(() => assertInstanceUserIdParam('other', 'user-a')).toThrow(ForbiddenException);
  });

  it('exige dono da instância', () => {
    expect(() => assertInstanceOwned(inst, 'user-b')).toThrow(ForbiddenException);
    expect(assertInstanceOwned(inst, 'user-a').name).toBe('linha-1');
    expect(() => assertInstanceOwned(null, 'user-a')).toThrow(NotFoundException);
  });
});
