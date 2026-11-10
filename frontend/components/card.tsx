'use client';

import { Book } from '@/types/book.type';
import { coverTransitionName } from '@/utils/cover-transition';
import { BookOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useState, ViewTransition } from 'react';

function Cover({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="library-cover">
      {src && !failed ? (
        // The title is already present in the link; the cover is decorative here.
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="library-cover-placeholder">
          <BookOutlined aria-hidden="true" />
          <span>Sin portada</span>
        </span>
      )}
    </div>
  );
}

function Card({ id, title, author, year, coverImage, rating, isFavorite }: Book) {
  return (
    <Link href={`/book/${id}`} className="library-card">
      <ViewTransition name={coverTransitionName(id)} default="none" share="book-cover">
        <Cover key={coverImage} src={coverImage} />
      </ViewTransition>
      <div className="library-card-content">
        <h2 className="library-card-title">{title}</h2>
        <p className="library-card-author">{author}</p>
        <p className="library-card-year">{year}</p>
        {(rating != null || isFavorite) && (
          <div className="library-card-details">
            {rating != null && <span className="library-card-rating"><span aria-hidden="true">★</span><span className="sr-only">Calificación del libro: </span>{rating}/5</span>}
            {isFavorite && <span className="library-card-favorite"><span aria-hidden="true">♥</span> Favorito</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

export default Card;
