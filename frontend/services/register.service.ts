import { Register } from '../types/register.type';
import { API_URL } from '../utils/constants';
import { responseError } from './authenticated-fetch';

export const registerUser = async (body: Register) => {
  const res = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return [await responseError(res), undefined] as const;
  }

  const { message }: { message: string } = await res.json();
  return [undefined, message] as const;
};
