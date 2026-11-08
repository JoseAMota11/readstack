import { Login } from '@/types/login.type';
import { API_URL } from '@/utils/constants';
import { responseError } from './authenticated-fetch';

export const loginUser = async (body: Login) => {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return [await responseError(res), undefined] as const;
  }

  const { token }: { token: string } = await res.json();
  return [undefined, token] as const;
};
