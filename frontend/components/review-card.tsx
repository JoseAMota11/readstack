'use client';

import { Review } from '@/types/review.type';
import { formatReviewDate } from '@/utils/review-date';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Popconfirm } from 'antd';

function ReviewCard({
  comment,
  rating,
  createdAt,
  onDelete,
  pending,
  disabled,
}: Review & { onDelete: () => void; pending: boolean; disabled: boolean }) {
  const date = formatReviewDate(createdAt);
  const showStars = Number.isInteger(rating) && rating >= 0 && rating <= 5;

  return (
    <div className="review-card">
      <div className="review-card-header">
        <p className="review-card-rating">
          {showStars && (
            <span className="review-card-stars" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className={index < rating ? 'review-card-star-filled' : 'review-card-star-empty'}>
                  {index < rating ? '★' : '☆'}
                </span>
              ))}
            </span>
          )}
          <span><span className="sr-only">Calificación: </span>{`${rating}/5`}</span>
        </p>
        <span aria-hidden="true">·</span>
        {date ? (
          <time className="review-card-date" dateTime={date.dateTime}>{date.text}</time>
        ) : (
          <p className="review-card-date">{createdAt}</p>
        )}
        <Popconfirm
          title="¿Borrar esta reseña?"
          description="Esta acción no se puede deshacer."
          okText="Borrar"
          cancelText="Cancelar"
          onConfirm={onDelete}
          okButtonProps={{ disabled }}
        >
          <Button
            type="text"
            aria-label="Borrar reseña"
            className="review-card-delete"
            icon={<DeleteOutlined className="text-sm" />}
            loading={pending}
            disabled={disabled}
          />
        </Popconfirm>
      </div>
      <p className="review-card-comment">{comment}</p>
    </div>
  );
}

export default ReviewCard;
