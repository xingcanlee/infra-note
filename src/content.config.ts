import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** posts/<slug>/index.mdx -> <slug>；posts/<slug>.md -> <slug>；嵌套目录保留路径。 */
export function postId(entry: string): string {
  return entry
    .replace(/\\/g, '/')
    .replace(/\.(md|mdx)$/i, '')
    .replace(/\/index$/i, '');
}

const posts = defineCollection({
  loader: glob({
    pattern: ['**/index.{md,mdx}', '*.{md,mdx}'],
    base: './src/content/posts',
    generateId: ({ entry }) => postId(entry),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string().max(80),
      description: z.string().max(200),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      category: z.string().optional(),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
      cover: image().optional(),
      lang: z.string().optional(),
      toc: z.boolean().default(true),
    }),
});

const pages = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: './src/content/pages',
    generateId: ({ entry }) => postId(entry),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { posts, pages };
