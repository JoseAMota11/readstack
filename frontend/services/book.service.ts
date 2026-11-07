'use client';

import { Filters } from '@/context/filters.context';
import { Book } from '@/types/book.type';
import { API_URL } from '@/utils/constants';
import { authenticatedFetch, responseError } from './authenticated-fetch';

export type Response = {
  books: Book[];
  pagination: {
    total: number;
    current: number;
    totalPages: number;
    size: number;
  };
};

export const getAllBooks = async (filters?: Filters) => {
  const url = new URL(`${API_URL}/books`);

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }

  const res = await authenticatedFetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(await responseError(res));
  const result = await res.json();

  return result as Response;
};

export const getOneBook = async (id: string) => {
  const res = await authenticatedFetch(`${API_URL}/books/${id}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    return [await responseError(res), undefined] as const;
  }

  const data = await res.json();
  return [undefined, data as Book] as const;
};

export const createBook = async (body: Book) => {
  const res = await authenticatedFetch(`${API_URL}/books/`, {
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

export const updateBook = async (id: string, body: Partial<Book>) => {
  const res = await authenticatedFetch(`${API_URL}/books/${id}`, {
    method: 'PATCH',
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

export const deleteBook = async (id: string) => {
  const res = await authenticatedFetch(`${API_URL}/books/${id}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    return [await responseError(res), undefined] as const;
  }

  const { message }: { message: string } = await res.json();
  return [undefined, message] as const;
};

export const exportBookCSV = async (id: string) => {
  const res = await authenticatedFetch(`${API_URL}/books/${id}/export`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    return [await responseError(res), undefined] as const;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `book-${id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
