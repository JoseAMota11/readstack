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

  const data: unknown = await res.json();
  if (!Array.isArray(data) || !data.every((item) =>
    item && typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.comment === 'string' && typeof item.rating === 'number' &&
    Number.isFinite(item.rating) && typeof item.createdAt === 'string'
  )) throw new Error('Invalid review list');
  return [undefined, data as Review[]] as const;
};

async function mutationResponse(res: Response) {
  if (!res.ok) {
    // These responses reject the request before a review mutation is applied.
    if ([400, 401, 403, 404].includes(res.status)) {
      return [await responseError(res), undefined] as const;
    }
    throw new Error('Unconfirmed review mutation');
  }
  const body: unknown = await res.json();
  if (!body || typeof body !== 'object' || !('message' in body) ||
      typeof body.message !== 'string' || !body.message.trim()) {
    throw new Error('Invalid review mutation response');
  }
  return [undefined, body.message] as const;
}

export const postReview = async (body: Review) => {
  const res = await authenticatedFetch(`${API_URL}/reviews/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return mutationResponse(res);
};

export const deleteReview = async (id: string) => {
  const res = await authenticatedFetch(`${API_URL}/reviews/${id}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
    },
  });

  return mutationResponse(res);
};
