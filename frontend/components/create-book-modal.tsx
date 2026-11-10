'use client';

import { bookSchema } from '@/schemas/book.shema';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { Button, Checkbox, ConfigProvider, Input, InputNumber, Modal, Select } from 'antd';
import { Dispatch, SetStateAction, useRef, useState } from 'react';
import {
  Controller,
  FieldValues,
  SubmitHandler,
  useForm,
} from 'react-hook-form';
import booksGenresOptions from '@/books-genres.json';
import { getTokenDecoded } from '@/utils/cookies-handlers';
import { createBook } from '@/services/book.service';
import { Book } from '@/types/book.type';
import { useMessage } from '@/context/message.context';
import { useFilters } from '@/context/filters.context';

function CreateBookModal({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({ resolver: zodResolver(bookSchema) });
  const messageApi = useMessage();
  const { refreshData } = useFilters();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);

  const onValid: SubmitHandler<FieldValues> = async (values) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      const data: FieldValues = {
        title: values.title, author: values.author, year: values.year,
        genre: values.genre, coverImage: values.coverImage, isFavorite: values.isFavorite,
      };
      const token = getTokenDecoded();

      if (token) {
        const { id } = token;
        data['userId'] = id;
      }

      const [error, message] = await createBook(data as Book);

      if (error) {
        messageApi.error(error);
        return;
      }
      if (typeof message !== 'string') throw new Error('Invalid response');
      messageApi.success(message.trim() ? message : 'Libro creado exitosamente.');
      setOpen(false);
      reset();
      refreshData();
    } catch {
      messageApi.error('No se pudo confirmar si se guardó el libro. Revisa tu biblioteca antes de volver a intentarlo.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  const handleCancel = () => {
    if (submitting.current) return;
    setOpen(false);
    reset();
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      maskClosable={!pending}
      keyboard={!pending}
      footer={false}
      closeIcon={false}
      className="create-book-modal"
      width={600}
    >
      <ConfigProvider componentDisabled={pending}>
        <form
          onSubmit={(event) => handleSubmit(onValid, (errors) => console.log(errors))(event)}
          className="create-book-form"
        >
          <h2 className="create-book-heading">
            Añadir libro
          </h2>
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
            <Button htmlType="button" onClick={handleCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button type="primary" htmlType="submit" loading={pending} disabled={pending}>
              Guardar
            </Button>
          </div>
        </form>
      </ConfigProvider>
    </Modal>
  );
}

export default CreateBookModal;
