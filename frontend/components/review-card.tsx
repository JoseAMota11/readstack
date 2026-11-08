'use client';

import { Review } from '@/types/review.type';
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
  return (
    <div className="bg-neutral-50 dark:bg-neutral-800 p-2 flex flex-col rounded-lg">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">{createdAt}</p>
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
            className="text-neutral-400 hover:text-red-500 dark:hover:bg-white/10"
            icon={<DeleteOutlined className="text-sm" />}
            loading={pending}
            disabled={disabled}
          />
        </Popconfirm>
      </div>
      <p>{comment}</p>
      <p className="self-end text-sm text-neutral-400">
        Calificación: {`${rating}/5`}
      </p>
    </div>
  );
}

export default ReviewCard;
