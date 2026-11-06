import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

/** 纯逻辑只依赖这几个字段，便于单测。 */
export interface PostLike {
  id: string;
  data: { pubDate: Date; draft: boolean };
}

/** 过滤草稿（includeDrafts 为 true 时保留），按 pubDate 降序；同时间按 id 升序以保持稳定。 */
export function filterAndSortPosts<T extends PostLike>(posts: T[], opts: { includeDrafts?: boolean } = {}): T[] {
  return posts
    .filter((p) => opts.includeDrafts || !p.data.draft)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime() || a.id.localeCompare(b.id));
}

/** 按发布年份分组，年份降序，组内保持输入顺序。 */
export function groupByYear<T extends PostLike>(posts: T[]): Array<{ year: number; posts: T[] }> {
  const map = new Map<number, T[]>();
  for (const p of posts) {
    const y = p.data.pubDate.getUTCFullYear();
    (map.get(y) ?? map.set(y, []).get(y)!).push(p);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([year, posts]) => ({ year, posts }));
}

/**
 * 唯一的取数入口。默认在生产环境过滤草稿，dev 环境显示草稿；
 * 显式传 includeDrafts 可覆盖。
 */
export async function getPosts(opts: { includeDrafts?: boolean } = {}): Promise<PostEntry[]> {
  const includeDrafts = opts.includeDrafts ?? import.meta.env.DEV;
  return filterAndSortPosts(await getCollection('posts'), { includeDrafts });
}
