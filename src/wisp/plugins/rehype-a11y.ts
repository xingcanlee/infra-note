import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * 补齐 Markdown 产物的无障碍属性：
 * - GFM 任务列表的 checkbox 没有可访问名称 → 用所在列表项的文字作 aria-label
 * - KaTeX 块级公式可能横向滚动 → 容器可键盘聚焦，role=group + aria-label
 */
export default function rehypeA11y() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      const cls: unknown = node.properties?.className;
      const classes = Array.isArray(cls) ? cls.map(String) : typeof cls === 'string' ? cls.split(/\s+/) : [];

      if (node.tagName === 'li' && classes.includes('task-list-item')) {
        const input = node.children.find(
          (c): c is Element => c.type === 'element' && c.tagName === 'input' && c.properties?.type === 'checkbox',
        ) ?? findCheckbox(node);
        if (input && !input.properties['ariaLabel']) {
          const label = textOf(node).trim().slice(0, 120);
          if (label) input.properties['ariaLabel'] = label;
        }
      }

      if (classes.includes('katex-display')) {
        node.properties.tabIndex = 0;
        node.properties.role = 'group';
        node.properties['ariaLabel'] = '公式';
      }
    });
  };
}

function findCheckbox(node: Element): Element | undefined {
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.tagName === 'input' && c.properties?.type === 'checkbox') return c;
    if (c.tagName === 'p') {
      const hit = findCheckbox(c);
      if (hit) return hit;
    }
  }
}

function textOf(node: Root | Element): string {
  let out = '';
  visit(node, 'text', (t: { value: string }) => {
    out += t.value;
  });
  return out.replace(/\s+/g, ' ');
}
