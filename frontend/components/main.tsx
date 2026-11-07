'use client';

import { getAllBooks, Response } from '@/services/book.service';
import Card from './card';
import { useEffect, useState } from 'react';
import { Book } from '@/types/book.type';
import { useFilters } from '@/context/filters.context';
import { Pagination } from 'antd';

function Main() {
  const [books, setBooks] = useState<Book[]>([]);
  const [pagination, setPagination] = useState<Response['pagination']>();
  const [loadError, setLoadError] = useState(false);
  const { filters, handleSetFilters, refresh } = useFilters();

  useEffect(() => {
    (async () => {
      try {
        const { books, pagination } = await getAllBooks(filters);
        setBooks(books);
        setPagination(pagination);
        setLoadError(false);
      } catch {
        setLoadError(true);
      }
    })();
  }, [filters, refresh]);

  const handlePageChange = (page: number, pageSize: number) => {
    handleSetFilters({ current: String(page), size: String(pageSize) });
  };

  const handlePageSizeChange = (_: number, pageSize: number) => {
    handleSetFilters({ current: '1', size: String(pageSize) });
  };

  if (loadError) return <p className="text-center">No se pudieron cargar los libros.</p>;

  if (books.length === 0 && Object.keys(filters).length > 0) {
    return (
      <p className="text-center">
        ¡Uups! Parece que no hay resultados para esta búsqueda.
      </p>
    );
  }

  if (books.length === 0) {
    return (
      <p className="text-center">
        Aún no tienes ningún libro guardado. ¡Empieza a guardar tus libros! ✨
      </p>
    );
  }

  return (
    <main className="flex flex-col items-center gap-4">
      <div className="w-[800px] grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 max-[800px]:w-full">
        {books.map((book) => (
          <Card key={book.id} {...book} />
        ))}
      </div>
      <Pagination
        current={pagination?.current}
        total={pagination?.total}
        pageSize={pagination?.size}
        onChange={handlePageChange}
        onShowSizeChange={handlePageSizeChange}
        pageSizeOptions={[2, 5, 10]}
        showSizeChanger
      />
    </main>
  );
}

export default Main;
