import type { Request, Response } from 'express';
import { csrfProtectionMiddleware, CSRF_COOKIE, CSRF_HEADER, generateCsrfToken } from './csrf';

function mockReqRes(method: string, opts?: { path?: string; cookies?: Record<string, string>; headers?: Record<string, string> }) {
  const req = {
    method,
    path: opts?.path ?? '/users/me',
    url: opts?.path ?? '/users/me',
    cookies: opts?.cookies ?? {},
    headers: opts?.headers ?? {},
  } as Request;
  const state = { statusCode: 200, body: undefined as unknown, nextCalled: false };
  const res = {
    status: (code: number) => {
      state.statusCode = code;
      return res;
    },
    json: (payload: unknown) => {
      state.body = payload;
      return res;
    },
  } as unknown as Response;
  const next = () => {
    state.nextCalled = true;
  };
  return { req, res, next, state };
}

describe('csrfProtectionMiddleware', () => {
  it('ignora GET', () => {
    const { req, res, next, state } = mockReqRes('GET');
    csrfProtectionMiddleware(req, res, next);
    expect(state.nextCalled).toBe(true);
  });

  it('bloqueia POST com token de sessão sem CSRF', () => {
    const { req, res, next, state } = mockReqRes('POST', {
      cookies: { token: 'jwt-here' },
    });
    csrfProtectionMiddleware(req, res, next);
    expect(state.nextCalled).toBe(false);
    expect(state.statusCode).toBe(403);
  });

  it('aceita POST quando cookie e header CSRF coincidem', () => {
    const csrf = generateCsrfToken();
    const { req, res, next, state } = mockReqRes('POST', {
      cookies: { token: 'jwt', [CSRF_COOKIE]: csrf },
      headers: { [CSRF_HEADER]: csrf },
    });
    csrfProtectionMiddleware(req, res, next);
    expect(state.nextCalled).toBe(true);
  });

  it('isenta login', () => {
    const { req, res, next, state } = mockReqRes('POST', {
      path: '/auth/login',
      cookies: { token: 'x' },
    });
    csrfProtectionMiddleware(req, res, next);
    expect(state.nextCalled).toBe(true);
  });
});
