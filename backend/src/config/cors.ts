import cors from 'cors';

export function configureCors(value: string | undefined) {
  if (value === undefined) return cors();

  const origins = value.split(',').map((entry) => {
    const origin = entry.trim();
    // Reject URL syntax that URL parsing might otherwise normalize away.
    if (!/^https?:\/\/[^\s\\/?#@*]+$/i.test(origin)) {
      throw new Error('Invalid CORS_ALLOWED_ORIGINS configuration');
    }
    try {
      const url = new URL(origin);
      if (!url.hostname || url.hostname.includes('*') || url.username || url.password || origin.endsWith(':')) {
        throw new Error();
      }
      return url.origin;
    } catch {
      throw new Error('Invalid CORS_ALLOWED_ORIGINS configuration');
    }
  });

  return cors({ origin: origins });
}
