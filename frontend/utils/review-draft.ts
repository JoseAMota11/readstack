type Draft = { comment: string; rating: number };
const prefix = 'review-draft:';
const lifetime = 24 * 60 * 60 * 1000;

function validDraft(value: any): value is Draft {
  return value && typeof value.comment === 'string' && typeof value.rating === 'number' && Number.isFinite(value.rating);
}

export function readReviewDraft(key: string): Draft | null {
  try {
    const saved = sessionStorage.getItem(key);
    if (!saved) return null;
    const stored = JSON.parse(saved);
    // Preserve drafts written by the earlier implementation during upgrade.
    if (validDraft(stored)) {
      writeReviewDraft(key, stored);
      return stored;
    }
    if (!validDraft(stored?.draft) || typeof stored.updatedAt !== 'number' || !Number.isFinite(stored.updatedAt) || stored.updatedAt > Date.now() || Date.now() - stored.updatedAt >= lifetime) {
      sessionStorage.removeItem(key);
      return null;
    }
    return stored.draft;
  } catch {
    try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

export function writeReviewDraft(key: string, draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify({ draft, updatedAt: Date.now() }));
    else sessionStorage.removeItem(key);
  } catch {
    // The in-memory draft remains available when storage is unavailable.
  }
}

export function cleanupReviewDrafts() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
    for (const key of keys) {
      if (key?.startsWith(prefix)) readReviewDraft(key);
    }
  } catch {
    // Storage may be unavailable.
  }
}
