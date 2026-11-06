import { defineWispConfig } from './wisp/config';

export default defineWispConfig({
  site: {
    title: 'Wisp',
    description: '安静好读的技术博客',
    author: 'xingcanlee',
    lang: 'zh-CN',
    url: 'https://example.com',
  },
  nav: [
    { label: '归档', href: '/archive/' },
    { label: '标签', href: '/tags/' },
    { label: '关于', href: '/about/' },
  ],
  social: [
    { kind: 'github', href: 'https://github.com/xingcanlee/astro-wisp' },
    { kind: 'rss', href: '/rss.xml' },
  ],
  home: { featuredCount: 3, pageSize: 10 },
  features: {
    codeCopy: true,
    lineNumbers: true,
    math: true,
    mermaid: true,
    toc: true,
    diagramDownload: true,
    codeFold: { enabled: true, maxLines: 24, previewLines: 12 },
  },
  mermaid: { strict: false },
  rss: { fullText: true },
  taxonomy: { slugMap: {} },
});
