export type Book = {
  id: string;
  title: string;
  author: string;
  year: number;
  genre: string[];
  coverImage?: string;
  rating?: number;
  reviewAverageRating: number | null;
  reviewRatingCount: number;
  isFavorite: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
};
