type ReviewAverageProps = { average: number | null; count: number };

export default function ReviewAverage({ average, count }: ReviewAverageProps) {
  if (count === 0 || average == null) return <span>Sin reseñas calificadas</span>;
  return <span className="library-card-rating"><span aria-hidden="true">★</span><span className="sr-only">Promedio: </span>{average.toFixed(1)} de 5 · {count} {count === 1 ? 'reseña' : 'reseñas'}</span>;
}
