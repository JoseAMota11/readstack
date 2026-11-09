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

  return (
    <div className="review-card">
      <div className="review-card-header">
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
      <p className="review-card-rating">
        Calificación: {`${rating}/5`}
      </p>
    </div>
  );
}

export default ReviewCard;
