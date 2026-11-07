'use client';

import { TokenDecoded } from '@/types/token.type';
import { decodeJwt } from 'jose';
import Cookies from 'js-cookie';
import { tokenExpiry } from './session';

let sessionVersion = 0;

export const setToken = (token: string) => {
  const expires = tokenExpiry(token);
  if (!expires) throw new Error('Invalid or expired session');
  Cookies.set('token', token, { expires });
  sessionVersion += 1;
};

export const getSessionVersion = () => sessionVersion;

export const getToken = () => {
  return Cookies.get('token');
};

export const getTokenDecoded = (): TokenDecoded | null => {
  const token = Cookies.get('token');

  return tokenExpiry(token) && token ? decodeJwt(token) : null;
};

export const removeToken = () => {
  sessionVersion += 1;
  return Cookies.remove('token');
};

export const hasToken = () => {
  return Boolean(Cookies.get('token'));
};
