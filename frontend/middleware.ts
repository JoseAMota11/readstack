import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loginPath, tokenExpiry } from './utils/session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('token')?.value;

  if ((pathname === '/' || pathname === '/book' || pathname.startsWith('/book/')) && !tokenExpiry(token)) {
    return NextResponse.redirect(new URL(loginPath(pathname + req.nextUrl.search), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/book/:path*'],
};
