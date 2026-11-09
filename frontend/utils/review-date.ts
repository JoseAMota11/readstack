const reviewDateFormatter = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
  calendar: 'gregory',
  numberingSystem: 'latn',
});

export function formatReviewDate(value: string): { text: string; dateTime: string } | null {
  if (value.length !== 19) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour > 23 || minute > 59 || second > 59) return null;

  const date = new Date(0);
  date.setUTCHours(hour, minute, second, 0);
  // Unlike Date.UTC, setUTCFullYear preserves years below 100.
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;

  return { text: reviewDateFormatter.format(date), dateTime: date.toISOString() };
}
