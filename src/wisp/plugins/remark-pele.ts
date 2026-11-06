import { render, PeleError } from 'pele';
import { visit } from 'unist-util-visit';
import type { Code, Html, Root, Parent } from 'mdast';
import type { Plugin } from 'unified';
import type { VFile } from 'vfile';

export interface RemarkPeleOptions {
  /** true：渲染失败时抛错（构建失败）。 */
  strict?: boolean;
  /** 开发模式：错误提示中附带 Pele 的源码片段。 */
  dev?: boolean;
}

const TYPE_NAMES: Record<string, string> = {
  flowchart: '流程图',
  sequence: '时序图',
  class: '类图',
  state: '状态图',
  er: 'ER 图',
  pie: '饼图',
  gantt: '甘特图',
  gitGraph: 'Git 图',
  mindmap: '思维导图',
  timeline: '时间线',
  journey: '用户旅程图',
  xychart: 'XY 图表',
  quadrantChart: '象限图',
  requirement: '需求图',
  c4: 'C4 图',
  sankey: '桑基图',
  block: '块图',
  packet: '数据包图',
  kanban: '看板',
  architecture: '架构图',
  radar: '雷达图',
  treemap: '矩形树图',
};

const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pele 把 accTitle/accDescr 写成 <title>/<desc>（内容已转义），这里直接取出。 */
function textOf(svg: string, tag: 'title' | 'desc'): string {
  const m = svg.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

export function remarkPele(options: RemarkPeleOptions = {}): ReturnType<Plugin<[], Root>> {
  const { strict = false, dev = false } = options;
  return (tree: Root, file: VFile) => {
    const jobs: Array<{ parent: Parent; index: number; node: Code }> = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang === 'mermaid' && parent && index !== undefined) jobs.push({ parent, index, node });
    });
    // 倒序处理，插入节点不会影响前面的索引
    for (const [i, { parent, index, node }] of [...jobs.entries()].reverse()) {
      try {
        // idPrefix 保证同页多图的 <title id> 不冲突；用文档内序号，输出是确定的
        const seq = i;
        const r = render(node.value, { idPrefix: `pele${seq}-` });
        const label =
          textOf(r.svg, 'title') || textOf(r.svg, 'desc') || TYPE_NAMES[r.type] || '图表';
        const html: Html = {
          type: 'html',
          value:
            // 可横向滚动的容器需要能被键盘聚焦（WCAG scrollable-region-focusable），
            // 所以 role=img + aria-label 放在可聚焦的滚动容器上，而不是 figure 上
            `<figure class="wisp-figure wisp-pele">` +
            `<div class="wisp-pele-body" tabindex="0" role="img" aria-label="${escAttr(label)}">${r.svg}</div></figure>`,
        };
        parent.children[index] = html;
      } catch (err) {
        const e = err as Partial<PeleError> & Error;
        const where = file.path ?? '<unknown>';
        const codeLine = node.position?.start.line;
        // 围栏起始行 + 1 = 代码第一行；Pele 的 line 从 1 开始
        const line = codeLine !== undefined ? codeLine + (e.line ?? 1) : undefined;
        const loc = line !== undefined ? `${where}:${line}` : where;
        const first = (e.message ?? String(err)).split('\n')[0];
        if (strict) {
          throw new Error(`Mermaid 渲染失败 (${loc}): ${e.message ?? err}`, { cause: err });
        }
        console.warn(`[wisp] Mermaid 渲染失败 (${loc}): ${first}`);
        const detail = dev ? e.message ?? first : first;
        const note: Html = {
          type: 'html',
          value: `<div class="wisp-pele-error" role="note">Mermaid 渲染失败：${escText(detail)}</div>`,
        };
        parent.children.splice(index, 0, note);
      }
    }
  };
}

export default remarkPele;
