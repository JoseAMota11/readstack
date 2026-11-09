'use client';

import { API_URL } from '@/utils/constants';
import { getSessionVersion, getToken, removeToken } from '@/utils/cookies-handlers';
import { tokenExpiry } from '@/utils/session';

export async function verifyLoginSession(signal: AbortSignal): Promise<'authenticated' | 'anonymous' | 'unavailable' | 'stale'> {
  const token = getToken();
  const version = getSessionVersion();
  if (!tokenExpiry(token) || !token) return 'anonymous';

  try {
    const response = await fetch(`${API_URL}/books?size=1`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    const currentToken = getToken();
    if (signal.aborted || getSessionVersion() !== version || currentToken !== token) return 'stale';
    if (response.status === 401) {
      removeToken();
      return 'anonymous';
    }
    if (!tokenExpiry(token)) return 'anonymous';
    return response.ok ? 'authenticated' : 'unavailable';
  } catch {
    return signal.aborted || getSessionVersion() !== version || getToken() !== token ? 'stale' : 'unavailable';
  }
}
