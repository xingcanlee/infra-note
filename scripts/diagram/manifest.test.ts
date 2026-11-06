import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkAll, contentHash, emptyManifest, entryStatus, GENERATOR, type Manifest, REPO_ROOT, scanSources, serializeManifest,
} from './manifest.ts';

let root: string;
const SRC = 'src/content/posts/demo/diagrams/flow.excalidraw';
const OUT = 'src/content/posts/demo/diagrams/flow.wisp.svg';

function write(rel: string, body: string) {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
}

function built(): Manifest {
  const m = emptyManifest();
  m.entries[SRC] = { source: contentHash('{"a":1}'), style: 'hand', exporter: 'excalidraw-playwright', embedFonts: false, outputs: { [OUT]: contentHash('<svg/>') } };
  return m;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wisp-manifest-'));
  write(SRC, '{"a":1}');
  write(OUT, '<svg/>');
  write('src/content/posts/demo/images/not-a-diagram.excalidraw', '{}');
  write('src/content/shared/diagrams/arch.drawio', '<mxfile/>');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('scanSources', () => {
  it('只扫描 diagrams/ 目录下的 .excalidraw / .drawio', () => {
    expect(scanSources(root)).toEqual(['src/content/posts/demo/diagrams/flow.excalidraw', 'src/content/shared/diagrams/arch.drawio']);
  });
});

describe('contentHash', () => {
  it('忽略 CRLF 差异', () => {
    expect(contentHash('a\r\nb')).toBe(contentHash('a\nb'));
    expect(contentHash('a')).toMatch(/^sha256-[0-9a-f]{64}$/);
  });
});

describe('entryStatus', () => {
  it('ok / unbuilt', () => {
    expect(entryStatus(SRC, built(), root)).toEqual({ kind: 'ok' });
    expect(entryStatus(SRC, emptyManifest(), root)).toEqual({ kind: 'unbuilt' });
  });
  it('源文件修改', () => {
    write(SRC, '{"a":2}');
    expect(entryStatus(SRC, built(), root).kind).toBe('source-changed');
  });
  it('产物缺失 / 被手改', () => {
    rmSync(join(root, OUT));
    expect(entryStatus(SRC, built(), root)).toEqual({ kind: 'output-missing', output: OUT });
    write(OUT, '<svg>edited</svg>');
    expect(entryStatus(SRC, built(), root)).toEqual({ kind: 'output-modified', output: OUT });
  });
  it('生成器版本变化', () => {
    const m = built();
    m.generator = 'wisp-diagram@0';
    expect(entryStatus(SRC, m, root).kind).toBe('generator-changed');
  });
});

describe('checkAll', () => {
  it('报告未构建与孤儿记录', () => {
    const m = built();
    m.entries['src/content/posts/gone/diagrams/x.drawio'] = { ...m.entries[SRC]!, style: 'clean' };
    const problems = checkAll(root, m);
    expect(problems.map((p) => p.source)).toEqual([
      'src/content/shared/diagrams/arch.drawio',
      'src/content/posts/gone/diagrams/x.drawio',
    ]);
    expect(problems[0]!.message).toMatch(/尚未构建/);
    expect(problems[1]!.message).toMatch(/不存在/);
  });
});

describe('serializeManifest', () => {
  it('键排序、稳定、末尾换行', () => {
    const m = built();
    m.entries['a/diagrams/b.drawio'] = { source: 'x', style: 'clean', exporter: 'drawio-browser', embedFonts: false, outputs: { 'z.svg': '1', 'a.svg': '2' }, pages: ['p1', 'p2'] };
    const s = serializeManifest(m);
    expect(s.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(s) as Manifest;
    expect(Object.keys(parsed.entries)).toEqual(['a/diagrams/b.drawio', SRC]);
    expect(Object.keys(parsed.entries['a/diagrams/b.drawio']!.outputs)).toEqual(['a.svg', 'z.svg']);
    expect(parsed.generator).toBe(GENERATOR);
    expect(serializeManifest(parsed)).toBe(s);
  });
});

describe('与 skill 的 Python 实现保持一致', () => {
  const py = readFileSync(join(REPO_ROOT, 'skills/wisp-diagram/scripts/wisp_diagram_lib/manifest.py'), 'utf8');
  const env = readFileSync(join(REPO_ROOT, 'skills/wisp-diagram/scripts/wisp_diagram_lib/env.py'), 'utf8');
  it('GENERATOR 相同', () => {
    expect(/^GENERATOR = "([^"]+)"/m.exec(env)?.[1]).toBe(GENERATOR);
  });
  it('扫描模式相同', () => {
    expect(py).toContain('DEFAULT_SCAN = ("src/content/**/diagrams/*.excalidraw", "src/content/**/diagrams/*.drawio")');
  });
  it('已提交的 manifest.json 是本模块的稳定序列化结果（Python 写出的文件与 TS 格式逐字节一致）', () => {
    const raw = readFileSync(join(REPO_ROOT, 'scripts/diagram/manifest.json'), 'utf8');
    expect(serializeManifest(JSON.parse(raw) as Manifest)).toBe(raw);
  });
});
