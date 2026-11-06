import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { describe, expect, it, vi } from 'vitest';
import { remarkPele } from './remark-pele';

const dir = join(__dirname, '../../../tests/fixtures/mermaid');

function run(md: string, opts = {}, path = 'post.md') {
  const proc = unified().use(remarkParse).use(remarkPele, opts);
  const tree = proc.parse(md);
  return proc.runSync(tree, { path, value: md } as never) as any;
}
const fence = (code: string) => '前言\n\n```mermaid\n' + code + '\n```\n';

describe('remarkPele fixtures', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mmd'))) {
    it(`renders ${f}`, async () => {
      const tree = run(fence(readFileSync(join(dir, f), 'utf8').trimEnd()));
      const html = tree.children[1];
      expect(html.type).toBe('html');
      expect(html.value).toMatch(/^<figure class="wisp-figure wisp-pele"><div class="wisp-pele-body" tabindex="0" role="img" aria-label="[^"]+">/);
      expect(html.value).toContain('<svg');
      await expect(html.value).toMatchFileSnapshot(`./__snapshots__/${f.replace('.mmd', '')}.svg.html`);
    });
  }
});

describe('aria-label', () => {
  const label = (code: string) => run(fence(code)).children[1].value.match(/aria-label="([^"]*)"/)![1];
  it('prefers accTitle', () => {
    expect(label('flowchart LR\n accTitle: 标题\n accDescr: 描述\n A-->B')).toBe('标题');
  });
  it('falls back to accDescr', () => {
    expect(label('flowchart LR\n accDescr: 仅描述\n A-->B')).toBe('仅描述');
  });
  it('falls back to diagram type name', () => {
    expect(label('flowchart LR\n A-->B')).toBe('流程图');
    expect(label('sequenceDiagram\n A->>B: hi')).toBe('时序图');
    expect(label('pie\n "a":1')).toBe('饼图');
  });
  it('escapes quotes', () => {
    expect(label('flowchart LR\n accTitle: say "hi" <b>\n A-->B')).not.toContain('"');
  });
  it('gives unique ids to multiple diagrams', () => {
    const md = fence('flowchart LR\n accTitle: a\n A-->B') + fence('flowchart LR\n accTitle: b\n A-->B');
    const t = run(md);
    const ids = t.children.filter((c: any) => c.type === 'html').map((c: any) => c.value.match(/<title id="([^"]+)"/)![1]);
    expect(new Set(ids).size).toBe(2);
  });
  it('does not nest a second .pele wrapper', () => {
    const v = run(fence('flowchart LR\n A-->B')).children[1].value;
    expect(v.match(/class="pele[ "]/g)).toHaveLength(1);
  });
});

describe('errors', () => {
  const bad = fence('flowchart LR\n A[[[ -->');
  it('non-strict keeps code block and inserts a note, warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = run(bad);
    expect(tree.children.map((c: any) => c.type)).toEqual(['paragraph', 'html', 'code']);
    expect(tree.children[1].value).toMatch(/^<div class="wisp-pele-error" role="note">Mermaid 渲染失败：/);
    expect(tree.children[2].lang).toBe('mermaid');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
  it('strict throws with file path and line', () => {
    expect(() => run(bad, { strict: true }, '/x/post.md')).toThrow(/\/x\/post\.md:5/);
  });
  it('ignores other languages', () => {
    const t = run('```ts\nconst a = 1\n```\n');
    expect(t.children[0].type).toBe('code');
  });
});
