import type { ShikiConfig } from '@astrojs/markdown-remark';
import type { WispConfig } from './config';

type ShikiTransformer = NonNullable<ShikiConfig['transformers']>[number];

/** 取节点内第一个文本字符（穿透嵌套 span） */
function firstChar(node: any): string | undefined {
  for (const c of node.children ?? []) {
    if (c.type === 'text') return c.value[0];
    const r = firstChar(c);
    if (r) return r;
  }
}

// 行尾标记：[!code ++] / [!code --]，前缀可为 //、# 或块注释起始符
const MARK = /\s*(?:\/\/|#|\/\*)\s*\[!code (\+\+|--)\]\s*(?:\*\/)?\s*$/;

/** 剥掉 diff 标记并记录行号；语言为 diff 的块按首字符 +/- 着色 */
export function wispDiffTransformer(): ShikiTransformer {
  return {
    name: 'wisp:diff',
    preprocess(code) {
      const marks = new Map<number, string>();
      const out = code.split('\n').map((l, i) => {
        const m = MARK.exec(l);
        if (!m) return l;
        marks.set(i + 1, m[1]!);
        return l.replace(MARK, '');
      });
      (this.meta as any).__wispDiff = marks;
      return out.join('\n');
    },
    line(node, line) {
      let kind = ((this.meta as any).__wispDiff as Map<number, string> | undefined)?.get(line);
      if (!kind && this.options.lang === 'diff') {
        const c = firstChar(node);
        if (c === '+') kind = '++';
        else if (c === '-') kind = '--';
      }
      if (kind) this.addClassToHast(node, kind === '++' ? 'diff add' : 'diff remove');
    },
  };
}

/**
 * github 主题中在 --wisp-code-bg 上对比度 < 4.5:1 的前景色（小写）：
 * 注释 #6a737d（light 4.45 / dark 3.72）、#22863a 4.28、#d73a49 4.23、#e36209 3.23。
 * 命中的 span 加 class `tok-low`，由 code.css 与 --wisp-fg 混色提亮对比度。
 * 这里只是识别主题输出的色值，不产生任何颜色。
 */
const LOW_CONTRAST = new Set(['#6a737d', '#22863a', '#d73a49', '#e36209']);

export function wispContrastTransformer(): ShikiTransformer {
  return {
    name: 'wisp:contrast',
    span(node, _line, _col, _lineNode, token) {
      const st = (token.htmlStyle ?? {}) as Record<string, string>;
      const hit = [st['--shiki-light'], st['--shiki-dark']].some((c) => c && LOW_CONTRAST.has(c.toLowerCase()));
      if (hit) this.addClassToHast(node, 'tok-low');
    },
  };
}

export type CodeFoldOptions = { enabled: boolean; maxLines: number; previewLines: number };

/**
 * 解析代码块 meta 中的折叠指令：`fold`、`nofold`、`fold=8`。
 * 返回 undefined 表示未指定（按行数阈值自动决定）。
 */
export function parseFoldMeta(raw: string | undefined): { fold: false } | { fold: true; lines?: number } | undefined {
  let r: ReturnType<typeof parseFoldMeta>;
  for (const t of (raw ?? '').split(/\s+/)) {
    if (t === 'nofold') r = { fold: false };
    else if (t === 'fold') r = { fold: true };
    else {
      const m = /^fold=(\d+)$/.exec(t);
      if (m && +m[1]! > 0) r = { fold: true, lines: +m[1]! };
    }
  }
  return r;
}

/** 给 pre 加语言信息，并包一层 div.wisp-code（语言标签 + 复制按钮的定位容器） */
export function wispFrameTransformer(lineNumbers: boolean, fold?: CodeFoldOptions): ShikiTransformer {
  return {
    name: 'wisp:frame',
    pre(node) {
      const lang = this.options.lang || 'text';
      node.properties.dataLanguage = lang;
      this.addClassToHast(node, 'wisp-pre');
      if (lineNumbers) this.addClassToHast(node, 'wisp-ln');
      node.properties.tabindex = 0;
      // 行数与折叠标记（不含 JS 时仍完整显示，脚本负责实际折叠）
      const code = node.children.find((c: any) => c.type === 'element' && c.tagName === 'code') as any;
      const lines = (code?.children ?? []).filter((c: any) => c.type === 'element' && c.properties?.class === 'line').length;
      (this.meta as any).__wispFrame = { lines, fold: undefined as number | undefined };
      if (fold?.enabled) {
        const m = parseFoldMeta((this.options.meta as any)?.__raw);
        const preview = m?.fold ? (m.lines ?? fold.previewLines) : fold.previewLines;
        const on = m ? m.fold : lines > fold.maxLines;
        if (on && lines > preview) (this.meta as any).__wispFrame.fold = preview;
      }
    },
    root(root) {
      const pre = root.children[0];
      if (!pre || pre.type !== 'element') return;
      const lang = String(pre.properties.dataLanguage ?? 'text');
      const fr = ((this.meta as any).__wispFrame ?? {}) as { lines?: number; fold?: number };
      const extra: Record<string, string | number> = {};
      if (fr.lines) extra['data-lines'] = fr.lines;
      if (fr.fold) extra['data-fold'] = fr.fold;
      root.children = [
        {
          type: 'element',
          tagName: 'div',
          properties: { class: 'wisp-code', 'data-language': lang, ...extra },
          children: [
            {
              type: 'element',
              tagName: 'span',
              properties: { class: 'wisp-lang', 'aria-hidden': 'true' },
              children: [{ type: 'text', value: lang === 'plaintext' ? 'text' : lang }],
            },
            pre,
          ],
        },
      ];
    },
  };
}

/**
 * 可直接放入 Astro `markdown.shikiConfig` 的对象。
 * Astro 7 的 unified 与 MDX 处理器共享 markdown.shikiConfig（rehype-shiki 读取它）。
 */
export function wispShikiConfig(config: WispConfig) {
  return {
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false as const,
    wrap: false as const,
    transformers: [wispDiffTransformer(), wispContrastTransformer(), wispFrameTransformer(config.features.lineNumbers, config.features.codeFold)],
  };
}
