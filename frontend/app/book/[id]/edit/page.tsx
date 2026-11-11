'use client';

import { useMessage } from '@/context/message.context';
import { editBookSchema } from '@/schemas/book.shema';
import { getOneBook, updateBook } from '@/services/book.service';
import { Book } from '@/types/book.type';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { Button, Checkbox, ConfigProvider, Input, InputNumber, Modal, Select, Spin } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Controller,
  FieldValues,
  SubmitHandler,
  useForm,
} from 'react-hook-form';
import booksGenresOptions from '@/books-genres.json';

const editFields = ['title', 'author', 'year', 'genre', 'coverImage', 'isFavorite'] as const;

function EditBookPage() {
  const { id } = useParams();
  return <EditBook key={id as string} id={id as string} />;
}

function EditBook({ id }: { id: string }) {
  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
  } = useForm({
    resolver: zodResolver(editBookSchema),
  });
  const messageApi = useMessage();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const loadedValues = useRef<(string | undefined)[]>([]);
  const detailUrl = `/book/${encodeURIComponent(id)}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const onValid: SubmitHandler<FieldValues> = async (values) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    let navigating = false;
    try {
      const data = {
        title: values.title, author: values.author, year: values.year,
        genre: values.genre, coverImage: values.coverImage, isFavorite: values.isFavorite,
        userId: id,
      };

      const [error, message] = await updateBook(id as string, data as Book);
      if (!mounted.current) return;

      if (error) {
        messageApi.error(error);
        return;
      }
      if (typeof message !== 'string') throw new Error('Invalid response');
      messageApi.success(message.trim() ? message : 'Libro actualizado exitosamente.');
      router.replace('/');
      navigating = true;
    } catch {
      if (mounted.current) messageApi.error('No se pudo confirmar si se actualizó el libro. Revisa tu biblioteca antes de volver a intentarlo.');
    } finally {
      if (!navigating) {
        submitting.current = false;
        if (mounted.current) setPending(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [error, book] = await getOneBook(id);
        if (!active) return;
        if (error || !book) {
          setLoadError(true);
          return;
        }
        const formBook = { ...book };
        if ('coverImage' in formBook) formBook.coverImage = formBook.coverImage ?? undefined;
        loadedValues.current = editFields.map((key) => JSON.stringify(key === 'isFavorite' && !(key in formBook) ? false : formBook[key]));
        for (const key of editFields) {
          if (key in formBook) setValue(key, formBook[key]);
        }
        setLoaded(true);
      } catch {
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [id, retry, setValue]);

  if (loadError) return <div className="text-center" role="alert"><p>No se pudo cargar el libro.</p><Button onClick={() => { setLoadError(false); setRetry((value) => value + 1); }}>Reintentar</Button></div>;
  if (!loaded) return <div className="text-center" role="status" aria-label="Cargando libro"><Spin /> Cargando libro...</div>;

  return (
    <main className="edit-book-page">
      <Link
        href={detailUrl}
        replace
        className="book-detail-return edit-book-return"
        aria-disabled={pending || undefined}
        aria-describedby={pending ? 'edit-book-pending' : undefined}
        onNavigate={(event) => {
          if (submitting.current) {
            event.preventDefault();
            return;
          }
          const current = getValues();
          if (editFields.some((key, index) => JSON.stringify(current[key]) !== loadedValues.current[index])) {
            event.preventDefault();
            setReturnOpen(true);
          }
        }}
      >
        <span aria-hidden="true">←</span> Volver al libro
      </Link>
      {pending && <p id="edit-book-pending" role="status">Espera a que termine la actualización antes de volver.</p>}
      <Modal
        title="¿Volver al libro?"
        open={returnOpen}
        onOk={() => { if (!submitting.current) router.replace(detailUrl); }}
        onCancel={() => setReturnOpen(false)}
        okText="Salir"
        cancelText="Seguir editando"
        okButtonProps={{ disabled: pending }}
        cancelButtonProps={{ autoFocus: true }}
        destroyOnHidden
        closable={false}
      >
        <p>Podrías perder los cambios de este formulario. Si intentaste guardar, comprueba el libro antes de volver a intentarlo.</p>
      </Modal>
      <ConfigProvider componentDisabled={pending}>
        <form
          onSubmit={(event) => handleSubmit(onValid, (errors) => console.log(errors))(event)}
          className="create-book-form"
        >
          <h1 className="create-book-heading">
            Editar libro
          </h1>
          <div className="create-book-field create-book-field--title">
            <label htmlFor="title">Título:</label>
            <Controller
              name="title"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id={field.name}
                  placeholder="Don Quijote de la Mancha"
                  status={errors.title && 'error'}
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                />
              )}
            />
            {errors.title && <span id="title-error" className="create-book-error"><ExclamationCircleFilled aria-hidden="true" /><span>El título es obligatorio.</span></span>}
          </div>
          <div className="create-book-field create-book-field--author">
            <label htmlFor="author">Autor:</label>
            <Controller
              name="author"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id={field.name}
                  placeholder="Miguel de Cervantes"
                  status={errors.author && 'error'}
                  aria-invalid={!!errors.author}
                  aria-describedby={errors.author ? 'author-error' : undefined}
                />
              )}
            />
            {errors.author && <span id="author-error" className="create-book-error"><ExclamationCircleFilled aria-hidden="true" /><span>El autor es obligatorio.</span></span>}
          </div>
          <div className="create-book-field create-book-field--year">
            <label htmlFor="year">Año:</label>
            <Controller
              name="year"
              control={control}
              render={({ field }) => (
                <InputNumber
                  {...field}
                  id={field.name}
                  min={1000}
                  max={9999}
                  placeholder="1605"
                  style={{ width: '100%' }}
                  status={errors.year && 'error'}
                  aria-invalid={!!errors.year}
                  aria-describedby={errors.year ? 'year-error' : undefined}
                />
              )}
            />
            {errors.year && <span id="year-error" className="create-book-error"><ExclamationCircleFilled aria-hidden="true" /><span>Introduce un año entero entre 1000 y 9999.</span></span>}
          </div>
          <div className="create-book-field create-book-field--genre">
            <label htmlFor="genre">Género:</label>
            <Controller
              name="genre"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  id={field.name}
                  mode="multiple"
                  placeholder="Aventura, Acción, etc."
                  status={errors.genre && 'error'}
                  aria-invalid={!!errors.genre}
                  aria-describedby={errors.genre ? 'genre-error' : undefined}
                  options={booksGenresOptions}
                />
              )}
            />
            {errors.genre && <span id="genre-error" className="create-book-error"><ExclamationCircleFilled aria-hidden="true" /><span>Debe incluir al menos un género.</span></span>}
          </div>
          <div className="create-book-field create-book-field--coverImage">
            <label htmlFor="coverImage">Imagen URL:</label>
            <Controller
              name="coverImage"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id={field.name}
                  placeholder="https://example.image.com/"
                  status={errors.coverImage && 'error'}
                  aria-invalid={!!errors.coverImage}
                  aria-describedby={errors.coverImage ? 'coverImage-error' : undefined}
                />
              )}
            />
            {errors.coverImage && <span id="coverImage-error" className="create-book-error"><ExclamationCircleFilled aria-hidden="true" /><span>Introduce una URL válida.</span></span>}
          </div>
          <div className="create-book-field create-book-field--isFavorite">
            <Controller
              name="isFavorite"
              control={control}
              defaultValue={false}
              render={({ field }) => (
                <Checkbox
                  {...field}
                  checked={field.value}
                  id={field.name}
                  aria-invalid={!!errors.isFavorite}
                  aria-describedby={errors.isFavorite ? 'isFavorite-error' : undefined}
                >
                  Favorito:
                </Checkbox>
              )}
            />
            {errors.isFavorite && <span id="isFavorite-error" className="create-book-error"><ExclamationCircleFilled aria-hidden="true" /><span>Indica si es favorito.</span></span>}
          </div>
          <div className="create-book-actions">
            <Button type="primary" htmlType="submit" loading={pending} disabled={pending}>
              Actualizar
            </Button>
          </div>
        </form>
      </ConfigProvider>
    </main>
  );
}

export default EditBookPage;
