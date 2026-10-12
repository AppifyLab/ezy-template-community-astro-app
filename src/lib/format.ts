/** Small presentation helpers. No data access here. */

/** "9 September 2026". Locale-fixed so the server and every visitor agree. */
export function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Crude tag strip — for previews and read time only, never for output safety. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Same 265 wpm as the community blog page. */
export function readingMinutes(html: string): number {
  const words = stripTags(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 265));
}

/** Excerpt when the post has one, otherwise the first words of the body. */
export function preview(excerpt: string | null, html: string | undefined, max = 160): string {
  const text = excerpt?.trim() || stripTags(html ?? '');
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Initials for the logo-less brand mark and the avatar-less author chip. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('');
}
