import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import wisp from 'astro-wisp';

export default defineConfig({
  site: 'https://xingcanlee.github.io/infra-note/',
  base: '/infra-note',
  integrations: [
    wisp({
      site: {
        title: 'infra-note',
        description: 'LLM 推理基础设施笔记：编译图、设备图、运行时调度与性能排错。',
        author: 'xingcanlee',
        authorGithub: 'https://github.com/xingcanlee',
        lang: 'zh-CN',
      },
      nav: [
        { label: '归档', href: '/archive/' },
        { label: '标签', href: '/tags/' },
        { label: '关于', href: '/about/' },
      ],
      social: [{ kind: 'rss', href: '/rss.xml' }],
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
      palette: './design/palette.json',
      customCss: ['./src/styles/code-overrides.css'],
    }),
    react(),
  ],
});
