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
        description:
          '从零推导的 LLM 推理系统笔记：异构硬件与量化、分布式并行通信、DeepSeek 架构演进、vLLM 与 vLLM-Ascend 推理引擎、推理执行图（CUDA Graph 与 ACL Graph）。',
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
      home: { featuredCount: 5, pageSize: 10 },
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
    }),
    react(),
  ],
});
