import { z } from 'astro/zod';

const navItem = z.object({ label: z.string(), href: z.string() });
const socialItem = z.object({
  kind: z.enum(['github', 'x', 'mastodon', 'bluesky', 'email', 'rss', 'link']),
  href: z.string(),
  label: z.string().optional(),
});

export const wispConfigSchema = z.object({
  site: z
    .object({
      title: z.string().default('Wisp'),
      description: z.string().default('安静好读的技术博客'),
      author: z.string().default(''),
      lang: z.string().default('zh-CN'),
      url: z.string().default('https://example.com'),
    })
    .prefault({}),
  nav: z
    .array(navItem)
    .default([
      { label: '归档', href: '/archive/' },
      { label: '标签', href: '/tags/' },
      { label: '关于', href: '/about/' },
    ]),
  social: z.array(socialItem).default([{ kind: 'rss', href: '/rss.xml' }]),
  home: z
    .object({
      featuredCount: z.number().int().min(0).default(3),
      pageSize: z.number().int().min(1).default(10),
    })
    .prefault({}),
  features: z
    .object({
      codeCopy: z.boolean().default(true),
      lineNumbers: z.boolean().default(true),
      math: z.boolean().default(true),
      mermaid: z.boolean().default(true),
      toc: z.boolean().default(true),
      diagramDownload: z.boolean().default(true),
      codeFold: z
        .object({
          enabled: z.boolean().default(true),
          maxLines: z.number().int().min(1).default(24),
          previewLines: z.number().int().min(1).default(12),
        })
        .prefault({}),
    })
    .prefault({}),
  mermaid: z.object({ strict: z.boolean().default(false) }).prefault({}),
  rss: z.object({ fullText: z.boolean().default(true) }).prefault({}),
  taxonomy: z
    .object({ slugMap: z.record(z.string(), z.string()).default({}) })
    .prefault({}),
});

export type WispConfig = z.output<typeof wispConfigSchema>;
export type WispConfigInput = DeepPartial<z.input<typeof wispConfigSchema>>;

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * 校验用户配置并与默认值深度合并。对象递归合并，数组整体替换。
 * 校验失败时抛出包含字段路径的错误。
 */
export function defineWispConfig(input: WispConfigInput = {}): WispConfig {
  const result = wispConfigSchema.safeParse(input);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`[wisp] wisp.config.ts 配置无效：${msg}`);
  }
  return result.data;
}
