'use client';

import { useMessage } from '@/context/message.context';
import { bookSchema } from '@/schemas/book.shema';
import { getOneBook, updateBook } from '@/services/book.service';
import { Book } from '@/types/book.type';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Checkbox, ConfigProvider, Input, InputNumber, Select, Spin } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Controller,
  FieldValues,
  SubmitHandler,
  useForm,
} from 'react-hook-form';
import booksGenresOptions from '@/books-genres.json';

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
  } = useForm({
    resolver: zodResolver(bookSchema),
  });
  const messageApi = useMessage();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);

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
      const data = { ...values, userId: id };

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
        for (const key in book) {
          setValue(key, book[key as keyof Book]);
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
    <div className="h-screen grid place-content-center max-[500px]:block max-[500px]:p-4">
      <ConfigProvider componentDisabled={pending}>
      <form
        onSubmit={handleSubmit(onValid, (errors) => console.log(errors))}
        className="bg-white dark:bg-neutral-800 p-4 rounded-lg shadow-lg grid grid-cols-[auto,300px] gap-4 items-center max-[500px]:grid-cols-[auto,180px]"
      >
        <h2 className="col-span-full text-lg font-semibold">
          Actualizar libro
        </h2>
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
            />
          )}
        />
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
            />
          )}
        />
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
            />
          )}
        />
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
              options={booksGenresOptions}
            />
          )}
        />
        <label htmlFor="coverImage">Imagen URL:</label>
        <Controller
          name="coverImage"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              id={field.name}
              placeholder="https://example.image.com/"
            />
          )}
        />
        <label htmlFor="rating">Calificación:</label>
        <Controller
          name="rating"
          control={control}
          render={({ field }) => (
            <InputNumber
              {...field}
              id={field.name}
              min={1}
              max={5}
              placeholder="5"
              style={{ width: '100%' }}
            />
          )}
        />
        <label htmlFor="isFavorite">Favorito:</label>
        <Controller
          name="isFavorite"
          control={control}
          defaultValue={false}
          render={({ field }) => (
            <Checkbox {...field} checked={field.value} id={field.name} />
          )}
        />
        <div className="col-span-full w-full flex justify-end">
          <Button type="primary" htmlType="submit" loading={pending} disabled={pending}>
            Actualizar
          </Button>
        </div>
      </form>
      </ConfigProvider>
    </div>
  );
}

export default EditBookPage;
