import { render } from 'astro:content';
import type { PostEntry } from './posts';

/** 对每篇文章 render() 并取 remarkPluginFrontmatter.readingTime（分钟），顺序与输入一致。 */
export async function getReadingTimes(posts: PostEntry[]): Promise<Array<number | undefined>> {
  return Promise.all(
    posts.map(async (p) => {
      const t = (await render(p)).remarkPluginFrontmatter?.readingTime;
      return typeof t === 'number' ? t : undefined;
    }),
  );
}
