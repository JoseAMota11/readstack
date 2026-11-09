'use client';

import { Book } from '@/types/book.type';
import Link from 'next/link';
import { useState } from 'react';

function Cover({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="library-cover">
      {src && !failed ? (
        // The title is already present in the link; the cover is decorative here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="library-cover-placeholder">Sin portada</span>
      )}
    </div>
  );
}

function Card({ id, title, author, year, coverImage, rating, isFavorite }: Book) {
  return (
    <Link href={`/book/${id}`} className="library-card">
      <Cover key={coverImage} src={coverImage} />
      <div className="library-card-content">
        <h2 className="library-card-title">{title}</h2>
        <p className="library-card-author">{author}</p>
        <p className="library-card-year">{year}</p>
        {(rating != null || isFavorite) && (
          <div className="library-card-details">
            {rating != null && <span>Calificación del libro: {rating}/5</span>}
            {isFavorite && <span><span aria-hidden="true">★ </span>Favorito</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

export default Card;
