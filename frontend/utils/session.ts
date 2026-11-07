import { decodeJwt, decodeProtectedHeader } from 'jose';

// Decoding only supports navigation and expiry; the API verifies signatures.
export function tokenExpiry(token?: string): Date | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const { alg } = decodeProtectedHeader(token);
    if (!alg || alg === 'none') return null;
    const { exp } = decodeJwt(token);
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    const date = new Date(exp * 1000);
    return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date : null;
  } catch {
    return null;
  }
}

export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost' || (url.pathname !== '/' && !url.pathname.startsWith('/book/'))) return '/';
    return url.pathname + url.search;
  } catch {
    return '/';
  }
}

export function loginPath(path: string): string {
  const target = safeReturnPath(path);
  return target === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(target)}`;
}
