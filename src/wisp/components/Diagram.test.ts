import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import config from '../../wisp.config';
import { remarkDiagram } from '../plugins/remark-diagram';
// tsc 不解析 .astro 模块（由 astro check / Vite 处理）
// @ts-ignore
import Diagram from './Diagram.astro';

const post = join(__dirname, '../../content/posts/attention-explained/index.mdx');

/** 使用仓库中真实的示例图（需要 manifest 与产物一致，即 `pnpm diagram check` 通过）。 */
describe('Diagram.astro', () => {
  it('renders exactly the same HTML as the image syntax', async () => {
    const md = '![自注意力计算流程](./diagrams/attention-flow.excalidraw "图 1：自注意力")\n';
    const proc = unified().use(remarkParse).use(remarkDiagram, { siteUrl: config.site.url, downloads: config.features.diagramDownload, base: '/' });
    const tree = proc.runSync(proc.parse(md), { path: post, value: md, data: {} } as never) as any;
    const fromRemark = tree.children[0].value as string;

    const container = await AstroContainer.create();
    const fromComponent = await container.renderToString(Diagram, {
      props: {
        src: './diagrams/attention-flow.excalidraw', alt: '自注意力计算流程', caption: '图 1：自注意力',
        __wispFrom: post, __wispSeq: '1',
      },
    });
    expect(fromComponent.trim()).toBe(fromRemark);
  });

  it('falls back to a per-request counter outside MDX', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Diagram, {
      props: { src: '/src/content/shared/diagrams/transformer-block.drawio', page: 'encoder' },
    });
    expect(html).toContain('data-page="encoder"');
    expect(html).toMatch(/id="[^"]+-a1"/);
    expect(html).toContain('href="/diagrams/shared/transformer-block.drawio"');
  });
});
