import { getIconData, iconToSVG, iconToHTML, replaceIDs } from '@iconify/utils';
import lucide from '@iconify-json/lucide/icons.json';

/**
 * Lucide 图标（构建期内联 SVG，零 JS）。供 Icon.astro 与需要输出 HTML 字符串的地方
 * （remark 插件、render-diagram、内联脚本模板）共用。
 *
 * - 颜色跟随 currentColor，尺寸默认 1em，与文字对齐
 * - 默认 aria-hidden；传 label 时改为 role="img" + aria-label
 */
export interface IconOptions {
  size?: number | string;
  label?: string;
  class?: string;
  strokeWidth?: number;
}

export function iconSvg(name: string, opts: IconOptions = {}): string {
  const data = getIconData(lucide as any, name);
  if (!data) throw new Error(`[wisp] 未知 Lucide 图标：${name}`);
  const size = opts.size ?? '1em';
  const svg = iconToSVG(data, { width: String(size), height: String(size) });
  let body = svg.body;
  if (opts.strokeWidth) body = body.replace(/stroke-width="[^"]*"/g, `stroke-width="${opts.strokeWidth}"`);
  const attrs: Record<string, string> = {
    ...svg.attributes,
    class: ['wisp-icon', opts.class].filter(Boolean).join(' '),
    ...(opts.label ? { role: 'img', 'aria-label': opts.label } : { 'aria-hidden': 'true', focusable: 'false' }),
  };
  return iconToHTML(replaceIDs(body), attrs);
}

export function hasIcon(name: string): boolean {
  return getIconData(lucide as any, name) != null;
}
