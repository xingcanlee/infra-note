import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx/container-renderer';
import { loadRenderers } from 'astro:container';
import { render } from 'astro:content';
import { getPosts } from '../wisp/utils/posts';
import config from '../wisp.config';
import { sitePath } from '../wisp/utils/paths';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  const site = context.site ?? new URL(config.site.url);
  const base = import.meta.env.BASE_URL;

  let container: AstroContainer | undefined;
  if (config.rss.fullText) {
    const renderers = await loadRenderers([mdxRenderer()]);
    container = await AstroContainer.create({ renderers });
  }

  const items = await Promise.all(
    posts.map(async (post) => {
      const link = sitePath(base, `/posts/${post.id}/`);
      let content: string | undefined;
      if (container) {
        try {
          const { Content } = await render(post);
          content = await container.renderToString(Content);
          // 正文中的站内相对链接改写为绝对地址，RSS 阅读器里才能打开
          content = content.replace(
            /(\s(?:href|src)=")\/(?!\/)/g,
            `$1${new URL(sitePath(base, '/'), site.origin).href}`,
          );
        } catch {
          // 含交互组件（React island 等）的文章无法在 RSS 中渲染：降级为摘要 + 原文链接
          const url = new URL(link, site).href;
          content = `<p>${post.data.description}</p><p>本文包含交互内容，请<a href="${url}">阅读原文</a>。</p>`;
        }
      }
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        link,
        categories: [...(post.data.category ? [post.data.category] : []), ...post.data.tags],
        ...(content ? { content } : {}),
      };
    }),
  );

  return rss({
    title: config.site.title,
    description: config.site.description,
    site,
    items,
    trailingSlash: true,
    customData: `<language>${config.site.lang}</language>`,
  });
}
