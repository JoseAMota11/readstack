'use client';

import { cleanupReviewDrafts } from '@/utils/review-draft';
import { useEffect } from 'react';

export default function ReviewDraftCleanup() {
  useEffect(() => {
    cleanupReviewDrafts();
    const interval = window.setInterval(cleanupReviewDrafts, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);
  return null;
}
