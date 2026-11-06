import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkPele from './plugins/remark-pele';
import remarkDiagram from './plugins/remark-diagram';
import remarkReadingTime from './plugins/remark-reading-time';
import remarkHasMath from './plugins/remark-has-math';
import rehypeA11y from './plugins/rehype-a11y';
import { copyDiagramSources, diagramDevMiddleware } from './lib/diagram-assets';
import { wispShikiConfig } from './shiki';
import type { WispConfig } from './config';

/**
 * Wisp 主题集成：注册 remark/rehype 插件、Shiki 配置、图表源文件下载。
 *
 * 插件顺序：math → pele（mermaid 代码块，须早于 Shiki）→ diagram（.excalidraw/.drawio 图片）
 *           → reading-time → has-math；rehype：katex。Shiki 由 markdown.shikiConfig 驱动。
 */
export default function wisp(config: WispConfig): AstroIntegration {
  let root = process.cwd();
  return {
    name: 'astro-wisp',
    hooks: {
      'astro:config:setup': ({ updateConfig, command, config: astroConfig }) => {
        root = fileURLToPath(astroConfig.root);
        const dev = command === 'dev';
        const remarkPlugins: any[] = [];
        const rehypePlugins: any[] = [];

        if (config.features.math) remarkPlugins.push(remarkMath);
        if (config.features.mermaid) remarkPlugins.push([remarkPele, { strict: config.mermaid.strict, dev }]);
        remarkPlugins.push([
          remarkDiagram,
          { dev, downloads: config.features.diagramDownload, siteUrl: config.site.url, base: astroConfig.base, root },
        ]);
        remarkPlugins.push(remarkReadingTime, remarkHasMath);
        if (config.features.math) rehypePlugins.push(rehypeKatex);
        rehypePlugins.push(rehypeA11y);

        updateConfig({
          markdown: {
            // Astro 7 默认使用 Sätteri；Wisp 依赖 remark/rehype 生态，显式使用 unified 处理器
            processor: unified({ remarkPlugins, rehypePlugins }),
            shikiConfig: wispShikiConfig(config),
          },
        });
      },
      'astro:server:setup': ({ server }) => {
        if (config.features.diagramDownload) {
          server.middlewares.use(diagramDevMiddleware({ base: server.config.base, root: server.config.root }));
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        if (!config.features.diagramDownload) return;
        const copied = copyDiagramSources(dir, { root });
        logger.info(`图表源文件：复制 ${copied.length} 个到 diagrams/`);
      },
    },
  };
}
