'use client';

import debounce from 'lodash.debounce';
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type FiltersContextType = {
  filters: Filters;
  handleSetFilters: (filters: Filters) => void;
  refresh: boolean;
  refreshData: () => void;
};

const filtersContext = createContext<FiltersContextType | null>(null);

export type Filters = {
  title?: string;
  author?: string;
  year?: string;
  genre?: string;
  current?: string;
  size?: string;
};

function createFilterUpdates(setFilters: Dispatch<SetStateAction<Filters>>) {
  let pending: Filters = {};
  const commit = debounce(() => {
    const patch = pending;
    pending = {};
    setFilters((prevFilters) => {
      const keys = Object.keys(patch) as (keyof Filters)[];
      if (keys.every((key) => (prevFilters[key] || undefined) === (patch[key] || undefined))) {
        return prevFilters;
      }
      return { ...prevFilters, ...patch };
    });
  }, 400);
  return {
    schedule: (patch: Filters) => {
      pending = { ...pending, ...patch };
      commit();
    },
    cancel: () => {
      commit.cancel();
      pending = {};
    },
  };
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>({});
  const [refresh, setRefresh] = useState(false);
  const filterUpdates = useMemo(() => createFilterUpdates(setFilters), []);

  const handleSetFilters = useCallback((patch: Filters) => {
    filterUpdates.schedule(patch);
  }, [filterUpdates]);

  useEffect(() => () => filterUpdates.cancel(), [filterUpdates]);

  const refreshData = () => {
    setRefresh((prevState) => !prevState);
  };

  return (
    <filtersContext.Provider
      value={{ filters, handleSetFilters, refresh, refreshData }}
    >
      {children}
    </filtersContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(filtersContext);

  if (!context) {
    throw new Error(
      'useFilters solo puede ser usado dentro de FiltersProvider'
    );
  }

  const { filters, handleSetFilters, refresh, refreshData } = context;

  return { filters, handleSetFilters, refresh, refreshData };
}
