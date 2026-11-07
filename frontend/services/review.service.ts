import { Review } from '@/types/review.type';
import { API_URL } from '@/utils/constants';
import { authenticatedFetch, responseError } from './authenticated-fetch';

export const getAllReviews = async (id: string) => {
  const res = await authenticatedFetch(`${API_URL}/reviews/${id}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    return [await responseError(res), undefined] as const;
  }

  const data = await res.json();
  return [undefined, data as Review[]] as const;
};

export const postReview = async (body: Review) => {
  const res = await authenticatedFetch(`${API_URL}/reviews/`, {
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

export const deleteReview = async (id: string) => {
  const res = await authenticatedFetch(`${API_URL}/reviews/${id}`, {
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
