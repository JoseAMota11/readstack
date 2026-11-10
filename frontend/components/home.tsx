'use client';

import { FiltersProvider } from '@/context/filters.context';
import React, { useState } from 'react';
import Filters from './filters';
import Footer from './footer';
import Navbar from './navbar';
import Main from './main';
import CreateBookModal from './create-book-modal';

function HomePage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="library-shell">
      <FiltersProvider>
        <Navbar />
        <main className="library-content">
          <h1 className="library-heading">Mi biblioteca</h1>
          <Filters setOpen={setOpen} />
          <section className="library-collection" aria-labelledby="library-collection-heading">
            <h2 id="library-collection-heading" className="library-collection-heading">Colección</h2>
            <Main />
          </section>
        </main>
        <Footer />
        <CreateBookModal open={open} setOpen={setOpen} />
      </FiltersProvider>
    </div>
  );
}

export default HomePage;
