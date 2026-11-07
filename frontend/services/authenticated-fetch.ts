'use client';

import { getSessionVersion, getToken, removeToken } from '@/utils/cookies-handlers';
import { loginPath } from '@/utils/session';

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getToken();
  const version = getSessionVersion();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + token);
  const response = await fetch(input, { ...init, headers });
  const currentToken = getToken();
  if (response.status === 401 && getSessionVersion() === version && (!currentToken || currentToken === token) && typeof window !== 'undefined') {
    removeToken();
    window.location.assign(loginPath(window.location.pathname + window.location.search));
  }
  return response;
}

export async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.error === 'string' && body.error) return body.error;
    if (typeof body.message === 'string' && body.message) return body.message;
  } catch {
    // A non-JSON error response is still a failure.
  }
  return 'Ocurrió un error inesperado.';
}
