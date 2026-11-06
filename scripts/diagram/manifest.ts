/**
 * scripts/diagram/manifest.json：记录每个图表源文件及其产物的内容哈希（diagrams.md §4）。
 * - build 只重建有变化的源文件；
 * - check 只比对哈希（CI 用，不需要浏览器或 draw.io）。
 * 实际的 build / check 由 skill 的 Python 实现完成（skills/wisp-diagram/scripts/wisp_diagram_lib/manifest.py，
 * 经 `pnpm diagram` 调用）。本模块是同一格式的 TS 只读/写实现，供 src/wisp/lib/render-diagram 的测试与对照使用；
 * 两边的哈希算法、序列化格式与 GENERATOR 必须保持一致（manifest.test.ts 有对照测试）。只依赖 node 内置模块。
 */
import { createHash } from 'node:crypto';
import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
/** 生成器标识；与 skills/wisp-diagram/scripts/wisp_diagram_lib/env.py 的 GENERATOR 相同。 */
export const GENERATOR = 'wisp-diagram@1';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST_PATH = join(REPO_ROOT, 'scripts', 'diagram', 'manifest.json');
export const SCAN_PATTERNS = ['src/content/**/diagrams/*.excalidraw', 'src/content/**/diagrams/*.drawio'];

export interface ManifestEntry {
  /** 源文件内容哈希 */
  source: string;
  style: 'hand' | 'clean';
  /** 生成时使用的导出方式（excalidraw-playwright / drawio-cli / drawio-docker / drawio-browser） */
  exporter: string;
  embedFonts: boolean;
  /** 产物（相对仓库根）→ 内容哈希；多页 draw.io 有多个 */
  outputs: Record<string, string>;
  /** draw.io 页面名，按顺序与 outputs 对应 */
  pages?: string[];
}

export interface Manifest {
  version: 1;
  generator: string;
  entries: Record<string, ManifestEntry>;
}

/** 内容哈希：统一换行符，避免 Windows 检出（autocrlf）导致误报。 */
export function contentHash(data: string | Buffer): string {
  const text = typeof data === 'string' ? data : data.toString('utf8');
  return `sha256-${createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')}`;
}

export const toPosix = (p: string) => p.split(sep).join('/');
export const repoRel = (abs: string, root = REPO_ROOT) => toPosix(relative(root, abs));

export function emptyManifest(): Manifest {
  return { version: 1, generator: GENERATOR, entries: {} };
}

export function loadManifest(path = MANIFEST_PATH): Manifest {
  if (!existsSync(path)) return emptyManifest();
  const m = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  if (m.version !== 1) throw new Error(`manifest 版本不支持：${String(m.version)}`);
  m.entries ??= {};
  return m;
}

const sortObj = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** 稳定序列化：键排序、2 空格缩进、末尾换行。 */
export function serializeManifest(m: Manifest): string {
  const entries: Record<string, ManifestEntry> = {};
  for (const [k, e] of Object.entries(sortObj(m.entries))) {
    entries[k] = {
      source: e.source, style: e.style, exporter: e.exporter, embedFonts: e.embedFonts,
      outputs: sortObj(e.outputs), ...(e.pages ? { pages: e.pages } : {}),
    };
  }
  return `${JSON.stringify({ version: 1, generator: m.generator, entries }, null, 2)}\n`;
}

export function saveManifest(m: Manifest, path = MANIFEST_PATH): void {
  writeFileSync(path, serializeManifest(m));
}

/** 扫描 src/content/**\/diagrams/*.{excalidraw,drawio}，返回相对仓库根的 POSIX 路径（已排序）。 */
export function scanSources(root = REPO_ROOT): string[] {
  const set = new Set<string>();
  for (const p of SCAN_PATTERNS) for (const f of globSync(p, { cwd: root })) set.add(toPosix(f));
  return [...set].sort();
}

export type Status =
  | { kind: 'ok' }
  | { kind: 'unbuilt' }
  | { kind: 'source-changed' }
  | { kind: 'output-missing'; output: string }
  | { kind: 'output-modified'; output: string }
  | { kind: 'generator-changed'; was: string };

/** 判断一个源文件的状态（只读文件、算哈希）。 */
export function entryStatus(rel: string, m: Manifest, root = REPO_ROOT): Status {
  const e = m.entries[rel];
  if (!e) return { kind: 'unbuilt' };
  if (contentHash(readFileSync(join(root, rel))) !== e.source) return { kind: 'source-changed' };
  for (const [out, h] of Object.entries(e.outputs)) {
    const abs = join(root, out);
    if (!existsSync(abs)) return { kind: 'output-missing', output: out };
    if (contentHash(readFileSync(abs)) !== h) return { kind: 'output-modified', output: out };
  }
  if (m.generator !== GENERATOR) return { kind: 'generator-changed', was: m.generator };
  return { kind: 'ok' };
}

export interface CheckProblem { source: string; message: string }

export function describeStatus(s: Status): string {
  switch (s.kind) {
    case 'ok': return 'ok';
    case 'unbuilt': return '尚未构建（manifest 中没有记录）';
    case 'source-changed': return '源文件已修改，产物过期';
    case 'output-missing': return `缺少产物 ${s.output}`;
    case 'output-modified': return `产物 ${s.output} 被手动修改（哈希不一致）`;
    case 'generator-changed': return `生成器版本变化（${s.was} → ${GENERATOR}）`;
  }
}

/** CI 校验：所有扫描到的源文件都已构建且哈希一致；manifest 中没有孤儿记录。 */
export function checkAll(root = REPO_ROOT, m = loadManifest(join(root, 'scripts', 'diagram', 'manifest.json'))): CheckProblem[] {
  const problems: CheckProblem[] = [];
  const sources = scanSources(root);
  for (const rel of sources) {
    const s = entryStatus(rel, m, root);
    if (s.kind !== 'ok') problems.push({ source: rel, message: describeStatus(s) });
  }
  const known = new Set(sources);
  for (const rel of Object.keys(m.entries)) {
    if (!known.has(rel)) problems.push({ source: rel, message: 'manifest 中有记录，但源文件已不存在（运行 build 清理）' });
  }
  return problems;
}
