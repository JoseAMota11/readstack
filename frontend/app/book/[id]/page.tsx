'use client';

import {
  deleteBook,
  exportBookCSV,
  getOneBook,
  updateBook,
} from '@/services/book.service';
import { Book } from '@/types/book.type';
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  FileExcelOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { Button, Modal, Tag } from 'antd';
import { Dispatch, SetStateAction, use, useEffect, useRef, useState } from 'react';
import booksGenresOptions from '@/books-genres.json';
import { useMessage } from '@/context/message.context';
import { usePathname, useRouter } from 'next/navigation';
import Reviews from '@/components/reviews';
import Link from 'next/link';
import ReviewAverage from '@/components/review-average';
import LoadingStatus from '@/components/loading-status';
import Navbar from '@/components/navbar';

type PageProps = {
  params: Promise<{ id: string }>;
};

function DetailsBookPage({ params }: PageProps) {
  const { id } = use(params);
  return <BookDetails key={id} id={id} />;
}

function BookDetails({ id }: { id: string }) {
  const messageApi = useMessage();
  const [blockedLogoutCount, setBlockedLogoutCount] = useState(0);
  const operations = useRef(new Set<symbol>());
  const beginOperation = () => {
    const operation = Symbol();
    operations.current.add(operation);
    return () => { operations.current.delete(operation); };
  };
  const requestLogout = (logout: () => void) => {
    if (operations.current.size) {
      setBlockedLogoutCount((count) => count + 1);
      messageApi.info(<span aria-hidden="true">Espera a que terminen las operaciones antes de cerrar sesión.</span>);
      return;
    }
    logout();
  };
  const [book, setBook] = useState<Book>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [aggregateState, setAggregateState] = useState<'current' | 'loading' | 'stale'>('current');
  const aggregateSequence = useRef(0);
  const aggregateMounted = useRef(false);

  useEffect(() => {
    const requests = aggregateSequence;
    aggregateMounted.current = true;
    return () => { aggregateMounted.current = false; requests.current++; };
  }, []);

  const refreshAggregate = async () => {
    const request = ++aggregateSequence.current;
    setAggregateState('loading');
    try {
      const [error, refreshed] = await getOneBook(id);
      if (!aggregateMounted.current || request !== aggregateSequence.current) return;
      if (error || !refreshed || refreshed.id !== id ||
        !Number.isInteger(refreshed.reviewRatingCount) || refreshed.reviewRatingCount < 0 ||
        (refreshed.reviewAverageRating !== null && (typeof refreshed.reviewAverageRating !== 'number' || !Number.isFinite(refreshed.reviewAverageRating)))) throw new Error('Invalid aggregate');
      setBook((previous) => previous?.id === id ? { ...previous, reviewAverageRating: refreshed.reviewAverageRating, reviewRatingCount: refreshed.reviewRatingCount } : previous);
      setAggregateState('current');
    } catch {
      if (aggregateMounted.current && request === aggregateSequence.current) setAggregateState('stale');
    }
  };

  const invalidateAggregate = () => {
    aggregateSequence.current++;
    setAggregateState('stale');
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [error, book] = await getOneBook(id);
        if (!active) return;
        if (error || !book) setLoadError(true);
        else setBook(book);
      } catch {
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [id, retry]);

  const updateLoadedBook: Dispatch<SetStateAction<Book | undefined>> = (value) => {
    setBook((previous) => (typeof value === 'function' ? value(previous) : value) ?? previous);
  };

  return (
    <>
    <div className="edit-book-nav"><Navbar onLogoutRequest={requestLogout} /></div>
    <main>
      <span className="sr-only" role="status" aria-atomic="true">
        {blockedLogoutCount > 0 && <span key={blockedLogoutCount}>Espera a que terminen las operaciones antes de cerrar sesión.</span>}
      </span>
      <div className="book-detail-navigation">
        <Link href="/" className="book-detail-return"><span aria-hidden="true">←</span> Volver a la biblioteca</Link>
      </div>
      {loadError ? <div className="library-state library-state-error book-detail-state" role="alert"><p>No se pudo cargar el libro.</p><Button onClick={() => { setLoadError(false); setRetry((value) => value + 1); }}>Reintentar</Button></div> : !book ? <LoadingStatus className="library-state book-detail-state" message="Cargando libro..." /> : (
      <div className="book-detail">
        <DetailCover key={book.coverImage} src={book.coverImage} title={book.title} />
        <div className="book-detail-content">
          <div className="book-detail-heading">
            <h1>{book.title}</h1>
            <p>{book.author}</p>
            <p className="book-detail-year">{book.year}</p>
          </div>
          <Genres genre={book.genre} />
          <div className="book-detail-rating" aria-live="polite">
            <p>Promedio de tus reseñas: {aggregateState === 'current' ? <ReviewAverage average={book.reviewAverageRating} count={book.reviewRatingCount} /> : aggregateState === 'loading' ? 'Actualizando promedio...' : 'Promedio sin actualizar.'}</p>
            {aggregateState === 'stale' && <Button onClick={() => void refreshAggregate()}>Reintentar promedio</Button>}
          </div>
          <ActionBar book={book} setBook={updateLoadedBook} beginOperation={beginOperation} />
          <Reviews bookId={book.id} onAggregateChange={() => void refreshAggregate()} onAggregateUncertain={invalidateAggregate} beginOperation={beginOperation} />
        </div>
      </div>
      )}
    </main>
    </>
  );
}

export default DetailsBookPage;

function DetailCover({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="book-detail-cover">
      {src && !failed ? (
        <img src={src} alt={title} onError={() => setFailed(true)} />
      ) : (
        <div className="book-detail-cover-placeholder library-cover-placeholder">
          <BookOutlined aria-hidden="true" />
          <span>Sin portada</span>
        </div>
      )}
    </div>
  );
}

function Genres({ genre }: { genre: string[] }) {
  const transformedGenre: string[] = [];

  booksGenresOptions.forEach(({ value, label }) => {
    if (genre.includes(value)) {
      transformedGenre.push(label);
    }
  });

  return (
    <div className="book-detail-genres">
      {transformedGenre.map((value) => (
        <Tag key={value}>
          {value}
        </Tag>
      ))}
    </div>
  );
}

function ActionBar({
  book,
  setBook,
  beginOperation,
}: {
  book: Book;
  setBook: Dispatch<SetStateAction<Book | undefined>>;
  beginOperation: () => () => void;
}) {
  const messageApi = useMessage();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useRef(false);
  const busy = useRef(false);
  const favoriteBlocked = useRef(false);
  const deleteDialogOpen = useRef(false);
  const deleteDialogVersion = useRef(0);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const restoreDeleteFocus = useRef(false);
  const [pending, setPending] = useState(false);
  const [favoriteUncertain, setFavoriteUncertain] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const active = () => mounted.current && window.location.pathname === pathname;

  const handleEdit = () => {
    router.replace(pathname + '/edit');
  };

  const handleDelete = async () => {
    if (busy.current) return;
    busy.current = true;
    const endOperation = beginOperation();
    setPending(true);
    let navigating = false;
    try {
      const [error, message] = await deleteBook(book.id);
      if (!active()) return;
      if (error || typeof message !== 'string') throw new Error('Unconfirmed deletion');
      restoreDeleteFocus.current = false;
      messageApi.success(message.trim() || 'Libro borrado exitosamente.');
      router.replace('/');
      navigating = true;
    } catch {
      if (active()) messageApi.error('No se pudo confirmar si se borró el libro. Revisa tu biblioteca antes de volver a intentarlo.');
    } finally {
      if (!navigating) {
        busy.current = false;
        if (active()) setPending(false);
        endOperation();
      }
    }
  };

  const openDeleteDialog = () => {
    if (!active() || busy.current || deleteDialogOpen.current) return;
    restoreDeleteFocus.current = false;
    deleteDialogVersion.current++;
    deleteDialogOpen.current = true;
    setDeleteOpen(true);
  };

  const closeDeleteDialog = () => {
    if (!active()) return;
    restoreDeleteFocus.current = !busy.current;
    // Dismissal never aborts an in-flight deletion.
    deleteDialogVersion.current++;
    deleteDialogOpen.current = false;
    setDeleteOpen(false);
  };

  const confirmDelete = async () => {
    if (!active() || !deleteDialogOpen.current || busy.current) return;
    const version = deleteDialogVersion.current;
    await handleDelete();
    if (active() && deleteDialogVersion.current === version) {
      deleteDialogOpen.current = false;
      setDeleteOpen(false);
    }
  };

  const handleFavorite = async () => {
    if (busy.current || favoriteBlocked.current) return;
    busy.current = true;
    const endOperation = beginOperation();
    setPending(true);
    const isFavorite = !book.isFavorite;
    try {
      const [error, message] = await updateBook(book.id, { isFavorite });
      if (!active()) return;
      if (error || typeof message !== 'string') throw new Error('Unconfirmed update');
      setBook((previous) => previous ? { ...previous, isFavorite } : previous);
      messageApi.info(
        `Libro ${isFavorite ? 'añadido a' : 'eliminado de'} favoritos.`
      );
    } catch {
      if (active()) {
        favoriteBlocked.current = true;
        setFavoriteUncertain(true);
        messageApi.error('No se pudo confirmar el cambio de favoritos. Recarga el libro para comprobar su estado.');
      }
    } finally {
      busy.current = false;
      if (active()) setPending(false);
      endOperation();
    }
  };

  const handleFavoriteRecovery = async () => {
    if (busy.current || !favoriteBlocked.current) return;
    busy.current = true;
    const endOperation = beginOperation();
    setPending(true);
    try {
      const [error, refreshed] = await getOneBook(book.id);
      if (!active()) return;
      if (error || !refreshed || refreshed.id !== book.id ||
        typeof refreshed.isFavorite !== 'boolean' || typeof refreshed.title !== 'string' ||
        typeof refreshed.author !== 'string' || typeof refreshed.year !== 'number' ||
        !Array.isArray(refreshed.genre) || !refreshed.genre.every((genre) => typeof genre === 'string') ||
        typeof refreshed.userId !== 'string' || typeof refreshed.createdAt !== 'string' ||
        typeof refreshed.updatedAt !== 'string' ||
        (refreshed.coverImage != null && typeof refreshed.coverImage !== 'string') ||
        (refreshed.rating != null && typeof refreshed.rating !== 'number')) {
        throw new Error('Invalid book response');
      }
      setBook((previous) => previous?.id === book.id ? { ...refreshed, reviewAverageRating: previous.reviewAverageRating, reviewRatingCount: previous.reviewRatingCount } : previous);
      favoriteBlocked.current = false;
      setFavoriteUncertain(false);
    } catch {
      if (active()) messageApi.error('No se pudo recargar el estado del libro. Comprueba tu conexión y vuelve a intentarlo.');
    } finally {
      busy.current = false;
      if (active()) setPending(false);
      endOperation();
    }
  };

  const handleExportCSV = async () => {
    if (busy.current) return;
    busy.current = true;
    const endOperation = beginOperation();
    setPending(true);
    try {
      await exportBookCSV(book.id);
    } catch {
      if (active()) messageApi.error('No se pudo preparar la exportación del libro.');
    } finally {
      busy.current = false;
      if (active()) setPending(false);
      endOperation();
    }
  };

  return (
    <div className="book-detail-actions">
        <Button
          type="text"
          aria-label="Exportar libro"
          className="book-detail-action book-detail-action-export"
          icon={<FileExcelOutlined />}
          onClick={handleExportCSV}
          disabled={pending}
        ><span className="book-detail-action-label">Exportar</span></Button>
        <Button
          type="text"
          aria-label="Editar libro"
          className="book-detail-action"
          icon={<EditOutlined />}
          onClick={handleEdit}
          disabled={pending}
        ><span className="book-detail-action-label">Editar</span></Button>
        <Button
          ref={deleteButtonRef}
          type="text"
          aria-label="Borrar libro"
          className="book-detail-action book-detail-action-delete"
          icon={<DeleteOutlined />}
          onClick={openDeleteDialog}
          disabled={pending}
        ><span className="book-detail-action-label">Borrar</span></Button>
      <Modal
        title="¿Borrar este libro?"
        open={deleteOpen}
        onOk={confirmDelete}
        onCancel={closeDeleteDialog}
        okText="Borrar"
        cancelText="Cancelar"
        okButtonProps={{ disabled: pending, danger: true }}
        cancelButtonProps={{ autoFocus: true }}
        focusTriggerAfterClose={false}
        afterClose={() => {
          const target = deleteButtonRef.current;
          if (restoreDeleteFocus.current && active() && !busy.current && !deleteDialogOpen.current &&
            target?.isConnected && !target.closest('[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"]') &&
            !target.matches(':disabled') && target.getClientRects().length > 0 &&
            getComputedStyle(target).visibility === 'visible') {
            target.focus();
          }
          restoreDeleteFocus.current = false;
        }}
        destroyOnHidden
        closable={false}
      >
        <p>Esta acción no se puede deshacer.</p>
      </Modal>
        <Button
          type="text"
          aria-label="Favorito"
          aria-pressed={favoriteUncertain ? undefined : book.isFavorite}
          className="book-detail-action book-detail-action-favorite"
          icon={book.isFavorite && !favoriteUncertain ? <StarFilled /> : <StarOutlined />}
          onClick={handleFavorite}
          disabled={pending || favoriteUncertain}
        ><span className="book-detail-action-label">Favorito</span></Button>
      {favoriteUncertain && <span className="book-detail-favorite-status">Estado sin confirmar</span>}
      {favoriteUncertain && <><span className="sr-only" role="status">No se pudo confirmar el cambio de favoritos. Recarga el estado para comprobarlo.</span><Button onClick={handleFavoriteRecovery} disabled={pending}>Recargar estado</Button></>}
    </div>
  );
}
