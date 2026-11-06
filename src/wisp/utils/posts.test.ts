import { describe, expect, it } from 'vitest';
import { filterAndSortPosts, groupByYear } from './posts';

const p = (id: string, d: string, draft = false) => ({ id, data: { pubDate: new Date(d), draft } });
const posts = [p('a', '2025-03-01'), p('b', '2026-11-06'), p('c', '2026-01-02', true), p('d', '2024-12-31')];

describe('filterAndSortPosts', () => {
  it('过滤草稿并按日期降序', () => {
    expect(filterAndSortPosts(posts).map((x) => x.id)).toEqual(['b', 'a', 'd']);
  });
  it('includeDrafts 保留草稿', () => {
    expect(filterAndSortPosts(posts, { includeDrafts: true }).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('不修改入参', () => {
    const copy = [...posts];
    filterAndSortPosts(posts);
    expect(posts).toEqual(copy);
  });
});

describe('groupByYear', () => {
  it('年份降序分组', () => {
    const g = groupByYear(filterAndSortPosts(posts, { includeDrafts: true }));
    expect(g.map((x) => x.year)).toEqual([2026, 2025, 2024]);
    expect(g[0]!.posts.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('空输入', () => expect(groupByYear([])).toEqual([]));
});
