'use client';

import { Review } from '@/types/review.type';
import { getTokenDecoded } from '@/utils/cookies-handlers';
import { Button, Input, Rate } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReviewCard from './review-card';
import { deleteReview, getAllReviews, postReview } from '@/services/review.service';
import { useMessage } from '@/context/message.context';
import { readReviewDraft, writeReviewDraft } from '@/utils/review-draft';

function Reviews({ bookId }: { bookId: string }) {
  const [token] = useState(getTokenDecoded);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [review, setReview] = useState({ rating: 0, comment: '' });
  const [listState, setListState] = useState<'loading' | 'loaded' | 'error' | 'stale'>('loading');
  const [pending, setPending] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reviewRef = useRef(review);
  const mounted = useRef(false);
  const pathname = useRef('');
  const sequence = useRef(0);
  const hasLoaded = useRef(false);
  const busy = useRef(false);
  const refreshingRef = useRef(false);
  const messageApi = useMessage();
  const draftKey = token?.id ? `review-draft:${token.id}:${bookId}` : null;
  const warningKey = token?.id ? `review-uncertain:${token.id}:${bookId}` : null;
  const active = () => mounted.current && typeof window !== 'undefined' && window.location.pathname === pathname.current;

  const saveWarning = useCallback((value: boolean) => {
    try {
      if (warningKey) {
        if (value) sessionStorage.setItem(warningKey, '1');
        else sessionStorage.removeItem(warningKey);
      }
    } catch { /* The warning remains in memory if storage is unavailable. */ }
  }, [warningKey]);

  useEffect(() => {
    const requests = sequence;
    mounted.current = true;
    pathname.current = window.location.pathname;
    try { if (warningKey && sessionStorage.getItem(warningKey)) setUncertain(true); } catch { /* Storage may be unavailable. */ }
    return () => { mounted.current = false; requests.current++; };
  }, [warningKey]);

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

  const getReviews = useCallback(async (forInspection = false) => {
    const request = ++sequence.current;
    if (forInspection) setInspected(false);
    if (!hasLoaded.current) setListState('loading');
    try {
      const [error, data] = await getAllReviews(bookId);
      if (!active() || request !== sequence.current) return;
      if (error || !data) throw new Error('Review list unavailable');
      setReviews(data);
      hasLoaded.current = true;
      setListState('loaded');
      if (forInspection) setInspected(true);
    } catch {
      if (!active() || request !== sequence.current) return;
      setListState(hasLoaded.current ? 'stale' : 'error');
      if (forInspection) setInspected(false);
    }
  // active reads refs, not render state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => { void getReviews(); }, [getReviews]);

  const refreshForInspection = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await getReviews(true);
    } finally {
      refreshingRef.current = false;
      if (active()) setRefreshing(false);
    }
  };

  const mutate = async (kind: 'create' | string) => {
    if (busy.current || uncertain) return;
    busy.current = true;
    setPending(kind);
    saveWarning(true);
    const submitted = reviewRef.current;
    try {
      const [error, message] = kind === 'create'
        ? await postReview({ ...submitted, userId: token?.id, bookId } as Review)
        : await deleteReview(kind);
      if (!active()) return;
      if (error) {
        saveWarning(false);
        messageApi.error(error);
      } else {
        saveWarning(false);
        if (kind === 'create' && reviewRef.current === submitted) {
          if (draftKey) writeReviewDraft(draftKey, null);
          reviewRef.current = { rating: 0, comment: '' };
          setReview(reviewRef.current);
        }
        messageApi.success(message);
        // Invalidate any older load immediately, and mark the displayed list stale.
        sequence.current++;
        setListState(hasLoaded.current ? 'stale' : 'loading');
        void getReviews();
      }
    } catch {
      if (!active()) return;
      sequence.current++;
      setListState(hasLoaded.current ? 'stale' : 'error');
      setInspected(false);
      setUncertain(true);
      messageApi.error('No se pudo confirmar el resultado. Actualiza y revisa las reseñas antes de volver a intentarlo.');
    } finally {
      busy.current = false;
      if (active()) setPending(null);
    }
  };

  const acknowledge = () => {
    if (!inspected || refreshingRef.current) return;
    saveWarning(false);
    setUncertain(false);
    setInspected(false);
  };

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
            <Rate value={review.rating} onChange={(value) => updateDraft({ ...reviewRef.current, rating: value })} />
          </div>
          <Button type="primary" className="dark:text-neutral-100" disabled={!review.comment || !review.rating || !!pending || uncertain} loading={pending === 'create'} onClick={() => mutate('create')}>
            Publicar reseña
          </Button>
        </div>
        <h3 className="font-semibold">{token?.username}</h3>
      </div>
      <div className="py-4">
        {uncertain && <div><p role="alert">No se pudo confirmar el resultado: puede que el cambio ya se haya aplicado. Actualiza y revisa las reseñas antes de volver a intentarlo manualmente. Si editaste el borrador durante el envío, puede ser distinto de lo enviado.</p><Button loading={refreshing} disabled={refreshing} onClick={() => void refreshForInspection()}>Actualizar reseñas</Button>{refreshing && <span role="status"> Actualizando reseñas...</span>}{inspected && !refreshing && <Button onClick={acknowledge}>Ya revisé las reseñas</Button>}</div>}
        {listState === 'loading' && <p role="status">Cargando reseñas...</p>}
        {(listState === 'error' || listState === 'stale') && <div role={uncertain ? undefined : 'alert'}><p>{listState === 'stale' ? 'Las reseñas mostradas podrían no estar actualizadas.' : 'No se pudieron cargar las reseñas.'}</p>{!uncertain && <Button onClick={() => void getReviews()}>Reintentar</Button>}</div>}
        {hasLoaded.current && (reviews.length === 0 ? (
          listState === 'loaded' && <p className="text-neutral-400 text-center">No has reseñado este libro. Expresa lo que piensas de él.</p>
        ) : (
          <div className="space-y-2 bg-neutral-200 dark:bg-neutral-600 p-2 rounded-lg">
            {reviews.map((item) => <ReviewCard key={item.id} {...item} onDelete={() => mutate(item.id)} pending={pending === item.id} disabled={!!pending || uncertain} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Reviews;
