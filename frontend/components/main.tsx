'use client';

import { getAllBooks, Response } from '@/services/book.service';
import Card from './card';
import { useEffect, useState } from 'react';
import { Book } from '@/types/book.type';
import { useFilters } from '@/context/filters.context';
import { Button, Pagination, Spin } from 'antd';

function Main() {
  const { filters, handleSetFilters, refresh } = useFilters();
  const filterKey = JSON.stringify({
    title: filters.title || undefined, author: filters.author || undefined,
    year: filters.year || undefined, genre: filters.genre || undefined,
    current: filters.current || undefined, size: filters.size || undefined,
  });

  return <BookList key={JSON.stringify([filterKey, refresh])} filterKey={filterKey} handleSetFilters={handleSetFilters} />;
}

function BookList({ filterKey, handleSetFilters }: { filterKey: string; handleSetFilters: ReturnType<typeof useFilters>['handleSetFilters'] }) {
  const [result, setResult] = useState<{ books: Book[]; pagination: Response['pagination'] }>();
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { books, pagination } = await getAllBooks(JSON.parse(filterKey));
        if (active) setResult({ books, pagination });
      } catch {
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [filterKey, retry]);

  const handlePageChange = (page: number, pageSize: number) => {
    handleSetFilters({ current: String(page), size: String(pageSize) });
  };

  const handlePageSizeChange = (_: number, pageSize: number) => {
    handleSetFilters({ current: '1', size: String(pageSize) });
  };

  if (loadError) return (
    <div className="text-center" role="alert">
      <p>No se pudieron cargar los libros.</p>
      <Button onClick={() => { setLoadError(false); setRetry((value) => value + 1); }}>Reintentar</Button>
    </div>
  );

  if (!result) return <div className="text-center" role="status" aria-label="Cargando libros"><Spin /> Cargando libros...</div>;

  const { books, pagination } = result;
  const filters = JSON.parse(filterKey);

  if (books.length === 0 && pagination.total > 0) {
    return <div className="text-center"><p>No hay libros en esta página.</p><Button onClick={() => handleSetFilters({ current: '1' })}>Volver a la primera página</Button></div>;
  }

  if (books.length === 0 && [filters.title, filters.author, filters.year, filters.genre].some(Boolean)) {
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
    <div className="library-results">
      <div className="library-grid">
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
    </div>
  );
}

export default Main;
