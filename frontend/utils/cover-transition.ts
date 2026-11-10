// Encode UTF-16 code units without collisions, including punctuation and empty IDs.
export function coverTransitionName(id: string): string {
  return `book-cover-${Array.from({ length: id.length }, (_, index) =>
    id.charCodeAt(index).toString(16).padStart(4, '0')
  ).join('')}`;
}
