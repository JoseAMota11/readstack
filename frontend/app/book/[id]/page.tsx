'use client';

import {
  deleteBook,
  exportBookCSV,
  getOneBook,
  updateBook,
} from '@/services/book.service';
import { Book } from '@/types/book.type';
import {
  DeleteOutlined,
  EditOutlined,
  FileExcelOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { Button, Modal, Spin, Tag } from 'antd';
import { Dispatch, SetStateAction, use, useEffect, useRef, useState } from 'react';
import booksGenresOptions from '@/books-genres.json';
import { useMessage } from '@/context/message.context';
import { usePathname, useRouter } from 'next/navigation';
import Reviews from '@/components/reviews';

type PageProps = {
  params: Promise<{ id: string }>;
};

function DetailsBookPage({ params }: PageProps) {
  const { id } = use(params);
  return <BookDetails key={id} id={id} />;
}

function BookDetails({ id }: { id: string }) {
  const [book, setBook] = useState<Book>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

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

  if (loadError) return <div className="text-center" role="alert"><p>No se pudo cargar el libro.</p><Button onClick={() => { setLoadError(false); setRetry((value) => value + 1); }}>Reintentar</Button></div>;
  if (!book) return <div className="text-center" role="status" aria-label="Cargando libro"><Spin /> Cargando libro...</div>;

  const updateLoadedBook: Dispatch<SetStateAction<Book | undefined>> = (value) => {
    setBook((previous) => (typeof value === 'function' ? value(previous) : value) ?? previous);
  };

  if (book) {
    const { title, coverImage, author, genre } = book;

    return (
      <div className="book-detail">
        <DetailCover key={coverImage} src={coverImage} title={title} />
        <div className="book-detail-content">
          <div className="book-detail-heading">
            <h1>{title}</h1>
            <p>{author}</p>
          </div>
          <Genres genre={genre} />
          <ActionBar book={book} setBook={updateLoadedBook} />
          <Reviews bookId={book.id} />
        </div>
      </div>
    );
  }
}

export default DetailsBookPage;

function DetailCover({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="book-detail-cover">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} onError={() => setFailed(true)} />
      ) : (
        <div className="book-detail-cover-placeholder">Sin portada</div>
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
}: {
  book: Book;
  setBook: Dispatch<SetStateAction<Book | undefined>>;
}) {
  const messageApi = useMessage();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useRef(false);
  const busy = useRef(false);
  const favoriteBlocked = useRef(false);
  const deleteDialogOpen = useRef(false);
  const deleteDialogVersion = useRef(0);
  const [pending, setPending] = useState(false);
  const [favoriteUncertain, setFavoriteUncertain] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const active = () => mounted.current && window.location.pathname === pathname;

  const handleEdit = () => {
    router.push(pathname + '/edit');
  };

  const handleDelete = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    let navigating = false;
    try {
      const [error, message] = await deleteBook(book.id);
      if (!active()) return;
      if (error || typeof message !== 'string') throw new Error('Unconfirmed deletion');
      messageApi.success(message.trim() || 'Libro borrado exitosamente.');
      router.replace('/');
      navigating = true;
    } catch {
      if (active()) messageApi.error('No se pudo confirmar si se borró el libro. Revisa tu biblioteca antes de volver a intentarlo.');
    } finally {
      if (!navigating) {
        busy.current = false;
        if (active()) setPending(false);
      }
    }
  };

  const openDeleteDialog = () => {
    if (!active() || busy.current || deleteDialogOpen.current) return;
    deleteDialogVersion.current++;
    deleteDialogOpen.current = true;
    setDeleteOpen(true);
  };

  const closeDeleteDialog = () => {
    if (!active()) return;
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
    }
  };

  const handleFavoriteRecovery = async () => {
    if (busy.current || !favoriteBlocked.current) return;
    busy.current = true;
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
      setBook((previous) => previous?.id === book.id ? refreshed : previous);
      favoriteBlocked.current = false;
      setFavoriteUncertain(false);
    } catch {
      if (active()) messageApi.error('No se pudo recargar el estado del libro. Comprueba tu conexión y vuelve a intentarlo.');
    } finally {
      busy.current = false;
      if (active()) setPending(false);
    }
  };

  const handleExportCSV = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await exportBookCSV(book.id);
    } catch {
      if (active()) messageApi.error('No se pudo preparar la exportación del libro.');
    } finally {
      busy.current = false;
      if (active()) setPending(false);
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
        focusTriggerAfterClose={!pending}
        destroyOnClose
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
        ><span className="book-detail-action-label">{favoriteUncertain ? 'Favorito' : book.isFavorite ? 'Favorito' : 'No favorito'}</span></Button>
      {favoriteUncertain && <span className="book-detail-favorite-status">Estado sin confirmar</span>}
      {favoriteUncertain && <><span className="sr-only" role="status">No se pudo confirmar el cambio de favoritos. Recarga el estado para comprobarlo.</span><Button onClick={handleFavoriteRecovery} disabled={pending}>Recargar estado</Button></>}
    </div>
  );
}
