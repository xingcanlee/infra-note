/** Prefix an internal site path with Astro's configured base path. */
export function sitePath(base: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const root = base === '/' ? '' : base.replace(/\/+$/, '');
  return `${root}/${path.replace(/^\/+/, '')}`;
}
