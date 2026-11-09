'use client';

import { useFilters } from '@/context/filters.context';
import { Button, Input, InputNumber, Select } from 'antd';
import { Dispatch, SetStateAction, useId, useState } from 'react';
import booksGenresOptions from '@/books-genres.json';

function Filters({ setOpen }: { setOpen: Dispatch<SetStateAction<boolean>> }) {
  const { filters, handleSetFilters } = useFilters();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const hasActiveFilters = Boolean(filters.author || filters.year || filters.genre);

  return (
    <section className="library-filters" aria-label="Buscar y filtrar libros">
      <div className="library-filters-inner">
        <div className="library-filter-field">
          <label htmlFor={`${id}-title`}>Buscar por título</label>
          <Input
            id={`${id}-title`}
            size="large"
            placeholder="Ej: Don Quijote de la Mancha"
            onChange={(e) =>
              handleSetFilters({ title: e.target.value, current: '1' })
            }
          />
        </div>
        <button
          type="button"
          className="library-filters-toggle"
          aria-expanded={expanded}
          aria-controls={`${id}-secondary`}
          onClick={() => setExpanded((previous) => !previous)}
        >
          <span>Más filtros</span>
          {hasActiveFilters && <span className="library-filters-active">Filtros activos</span>}
        </button>
        <div id={`${id}-secondary`} className="library-filters-secondary" data-expanded={expanded}>
          <div className="library-filter-field">
            <label htmlFor={`${id}-author`}>Autor</label>
            <Input
              id={`${id}-author`}
              size="large"
              placeholder="Ej: Miguel de Cervantes"
              onChange={(e) =>
                handleSetFilters({ author: e.target.value, current: '1' })
              }
            />
          </div>
          <div className="library-filter-field">
            <label htmlFor={`${id}-year`}>Año</label>
            <InputNumber
              id={`${id}-year`}
              size="large"
              placeholder="Ej: 1605"
              style={{ width: '100%' }}
              onChange={(value) =>
                handleSetFilters({ year: value as string, current: '1' })
              }
            />
          </div>
          <div className="library-filter-field">
            <label htmlFor={`${id}-genre`}>Género</label>
            <Select
              id={`${id}-genre`}
              size="large"
              placeholder="Ej: Aventura"
              style={{ width: '100%' }}
              options={booksGenresOptions}
              virtual={false}
              showSearch
              allowClear
              onSelect={(value) =>
                handleSetFilters({ genre: value, current: '1' })
              }
              onClear={() =>
                handleSetFilters({ genre: undefined, current: '1' })
              }
            />
          </div>
        </div>
        <div className="library-filters-action">
          <Button type="primary" size="large" onClick={() => setOpen(true)}>
            Añadir libro
          </Button>
        </div>
      </div>
    </section>
  );
}

export default Filters;
