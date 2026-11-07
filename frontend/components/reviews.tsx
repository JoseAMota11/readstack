'use client';

import { Review } from '@/types/review.type';
import { getTokenDecoded } from '@/utils/cookies-handlers';
import { Button, Input, Rate } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReviewCard from './review-card';
import { getAllReviews, postReview } from '@/services/review.service';
import { useMessage } from '@/context/message.context';
import { readReviewDraft, writeReviewDraft } from '@/utils/review-draft';

function Reviews({ bookId }: { bookId: string }) {
  const [token] = useState(getTokenDecoded);
  const [username, setUsername] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [review, setReview] = useState({
    rating: 0,
    comment: '',
  });
  const reviewRef = useRef(review);
  const messageApi = useMessage();
  const draftKey = token?.id ? `review-draft:${token.id}:${bookId}` : null;

  useEffect(() => {
    if (!draftKey) return;
    const draft = readReviewDraft(draftKey);
    if (draft) {
      reviewRef.current = draft;
      setReview(draft);
    }
  }, [draftKey]);

  const updateDraft = (next: typeof review) => {
    reviewRef.current = next;
    if (draftKey) writeReviewDraft(draftKey, next);
    setReview(next);
  };

  const handlePostReview = async () => {
    const submitted = reviewRef.current;
    const data = { ...submitted, userId, bookId };
    try {
      const [error, message] = await postReview(data as Review);
      if (error) {
        messageApi.error(error);
      } else {
        if (reviewRef.current === submitted) {
          if (draftKey) writeReviewDraft(draftKey, null);
          reviewRef.current = { rating: 0, comment: '' };
          setReview(reviewRef.current);
        }
        messageApi.success(message);
        getReviews();
      }
    } catch {
      messageApi.error('No se pudo publicar la reseña.');
    }
  };

  const getReviews = useCallback(async () => {
    const [error, data] = await getAllReviews(bookId);

    if (error) {
      messageApi.error(error);
    } else {
      setReviews(data!);
    }
  }, [bookId, messageApi]);

  useEffect(() => {
    getReviews();
  }, [getReviews]);

  useEffect(() => {
    if (token) {
      const { username, id } = token;
      setUsername(username);
      setUserId(id);
    }
  }, [token]);

  return (
    <div className="w-full bg-white dark:bg-neutral-800 p-4 rounded-lg shadow-lg">
      <div className="flex flex-col gap-2">
        <Input.TextArea
          className="min-h-16 max-h-24 dark:bg-neutral-600 dark:placeholder:text-neutral-400"
          placeholder="¡Me encantó este libro!"
          value={review.comment}
          onChange={(e) => updateDraft({ ...reviewRef.current, comment: e.target.value })}
        />
        <div className="flex justify-between items-center">
          <div className="p-1 rounded-md dark:bg-neutral-400">
            <Rate
              value={review.rating}
              onChange={(value) => updateDraft({ ...reviewRef.current, rating: value })}
            />
          </div>
          <Button
            type="primary"
            className=" dark:text-neutral-100"
            disabled={!review.comment || !review.rating}
            onClick={handlePostReview}
          >
            Publicar reseña
          </Button>
        </div>
        <h3 className="font-semibold">{username}</h3>
      </div>
      <div className="py-4">
        {reviews.length === 0 ? (
          <p className="text-neutral-400 text-center">
            No has reseñado este libro. Expresa lo que piensas de él.
          </p>
        ) : (
          <div className="space-y-2 bg-neutral-200 dark:bg-neutral-600 p-2 rounded-lg">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                {...review}
                updateReviews={getReviews}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Reviews;
