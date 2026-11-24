import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const POSTS = join(SRC, 'content', 'posts');
const PAGES = join(SRC, 'content', 'pages');

const SERIES_EXPECTED = [
  { id: 'foundations', count: 7 },
  { id: 'distributed', count: 4 },
  { id: 'deepseek', count: 11 },
  { id: 'vllm', count: 7 },
  { id: 'aclgraph', count: 7 },
] as const;

type SeriesId = (typeof SERIES_EXPECTED)[number]['id'];

interface SeriesMeta {
  id: string;
  order: number;
}

interface PostRecord {
  slug: string;
  file: string;
  dir: string;
  route: string;
  series: SeriesMeta;
  pubDateMs: number;
  raw: string;
  body: string;
}

function listAllFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listAllFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function parseMeta(raw: string, file: string): { series: SeriesMeta; pubDateMs: number } {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  expect(fmMatch, `Missing frontmatter in ${file}`).not.toBeNull();
  const fm = fmMatch![1];
  const singleLine = /^series:\s*\{\s*id:\s*([a-z0-9-]+)\s*,\s*order:\s*(\d+)\s*\}\s*$/m.exec(fm);
  expect(singleLine, `Expected single-line flow mapping series in ${file}`).not.toBeNull();
  const dateMatch = /^pubDate:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?\s*$/m.exec(fm);
  expect(dateMatch, `Missing pubDate in ${file}`).not.toBeNull();
  return {
    series: { id: singleLine![1], order: Number(singleLine![2]) },
    pubDateMs: Date.parse(`${dateMatch![1]}T00:00:00Z`),
  };
}

function stripFrontmatterAndCode(raw: string): string {
  const noFm = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return noFm
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/(?<!\\)\$(?!\s)[^$\r\n]+?(?<!\s)\$/g, '');
}

function loadSeriesPosts(seriesId: SeriesId): PostRecord[] {
  const baseDir = join(POSTS, seriesId);
  const posts: PostRecord[] = [];

  const rootIndex = join(baseDir, 'index.mdx');
  expect(existsSync(rootIndex), `Missing series index ${rootIndex}`).toBe(true);
  expect(existsSync(join(baseDir, 'index.md'))).toBe(false);

  const rootRaw = readFileSync(rootIndex, 'utf8');
  const rootMeta = parseMeta(rootRaw, rootIndex);
  posts.push({
    slug: `${seriesId}`,
    file: rootIndex,
    dir: baseDir,
    route: `/posts/${seriesId}/`,
    series: rootMeta.series,
    pubDateMs: rootMeta.pubDateMs,
    raw: rootRaw,
    body: stripFrontmatterAndCode(rootRaw),
  });

  const subdirs = readdirSync(baseDir)
    .filter((d) => /^\d{2}-/.test(d) && statSync(join(baseDir, d)).isDirectory())
    .sort();

  for (const sub of subdirs) {
    const dir = join(baseDir, sub);
    const mdxPath = join(dir, 'index.mdx');
    const mdPath = join(dir, 'index.md');
    expect(existsSync(mdxPath), `Missing index.mdx in ${dir}`).toBe(true);
    expect(existsSync(mdPath), `Duplicate index.md in ${dir}`).toBe(false);

    const raw = readFileSync(mdxPath, 'utf8');
    const meta = parseMeta(raw, mdxPath);
    posts.push({
      slug: `${seriesId}/${sub}`,
      file: mdxPath,
      dir,
      route: `/posts/${seriesId}/${sub}/`,
      series: meta.series,
      pubDateMs: meta.pubDateMs,
      raw,
      body: stripFrontmatterAndCode(raw),
    });
  }
  return posts;
}

const bySeries = Object.fromEntries(
  SERIES_EXPECTED.map(({ id }) => [id, loadSeriesPosts(id)]),
) as Record<SeriesId, PostRecord[]>;
const allPosts = SERIES_EXPECTED.flatMap(({ id }) => bySeries[id]);

describe('infra-note content integrity', () => {
  it('has exact 5-series structure, contiguous orders, and homepage ordering', () => {
    for (const { id, count } of SERIES_EXPECTED) {
      expect(bySeries[id]).toHaveLength(count);
      expect(bySeries[id].map((p) => p.series)).toEqual(
        Array.from({ length: count }, (_, idx) => ({ id, order: idx + 1 })),
      );
    }
    expect(allPosts).toHaveLength(36);

    const topDirs = readdirSync(POSTS).filter((d) => statSync(join(POSTS, d)).isDirectory());
    expect(topDirs.sort()).toEqual(['aclgraph', 'deepseek', 'distributed', 'foundations', 'vllm']);

    const orderedByUpdated = [...SERIES_EXPECTED]
      .map(({ id }) => ({
        id,
        updated: Math.max(...bySeries[id].map((p) => p.pubDateMs)),
      }))
      .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
      .map((s) => s.id);
    expect(orderedByUpdated).toEqual([
      'foundations',
      'distributed',
      'deepseek',
      'vllm',
      'aclgraph',
    ]);
  });

  it('keeps explainers and shared kit free of hardcoded hex, gradients, or shadows', () => {
    const explainersDir = join(SRC, 'explainers');
    expect(existsSync(join(explainersDir, 'kit', 'index.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'scripts', 'verify_toys.py'))).toBe(false);

    const postExplainerFiles = listAllFiles(POSTS).filter(
      (f) => /[\\/]explainers[\\/]/.test(f) && !f.endsWith('.test.ts') && /\.(ts|tsx|css)$/.test(f),
    );
    const sharedExplainerFiles = listAllFiles(explainersDir).filter(
      (f) => !f.includes('__tests__') && /\.(ts|tsx|css)$/.test(f),
    );

    for (const file of [...sharedExplainerFiles, ...postExplainerFiles]) {
      const text = readFileSync(file, 'utf8');
      expect(text, `Hardcoded hex color found in ${file}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(text, `SVG gradient found in ${file}`).not.toMatch(/<linearGradient|<radialGradient/);
      expect(text, `Drop shadow found in ${file}`).not.toMatch(/drop-shadow|feDropShadow/);
    }
  });

  it('removes legacy toy.py scripts and verifies 4-way visual routing + GPU/NPU code coverage', () => {
    const chapterPosts = allPosts.filter((p) => p.series.order >= 2);
    expect(chapterPosts).toHaveLength(31);

    const aboutText = readFileSync(join(PAGES, 'about.md'), 'utf8');
    expect(aboutText).not.toMatch(/\btoy\.py\b|verify_toys/);

    for (const post of allPosts) {
      const isIndex = post.series.order === 1;
      expect(
        existsSync(join(post.dir, 'toy.py')),
        `Legacy toy.py still exists in ${post.slug}`,
      ).toBe(false);
      expect(post.raw, `Legacy toy.py reference in ${post.slug}`).not.toMatch(/\btoy\.py\b/);

      const mermaidCount = (post.raw.match(/^```mermaid\b/gm) ?? []).length;
      const staticDiagramMatches = [
        ...post.raw.matchAll(/!\[[^\]]*\]\(\.\/diagrams\/[^)\s]+(?:\s+(['"])(.*?)\1)?\)/g),
      ];
      for (const m of staticDiagramMatches) {
        expect(m[2] ?? '', `Missing "图 ..." title on static diagram in ${post.slug}`).toMatch(
          /^图\s*\d+：/,
        );
      }
      const explainerCount = (post.raw.match(/<[A-Z]\w*Explainer\b/g) ?? []).length;
      for (const expMatch of post.raw.matchAll(/<[A-Z]\w*Explainer\b[^>]*\/>/g)) {
        expect(
          expMatch[0],
          `Explainer missing client: hydration directive in ${post.slug}`,
        ).toMatch(/\bclient:/);
      }
      const visualCount = mermaidCount + staticDiagramMatches.length + explainerCount;

      expect(visualCount, `Expected >= 1 visual in ${post.slug}`).toBeGreaterThanOrEqual(1);
      if (!isIndex) {
        expect(post.raw, `Expected python implementation fence in ${post.slug}`).toMatch(
          /^```python\b/m,
        );
      }

      const diagDir = join(post.dir, 'diagrams');
      if (existsSync(diagDir)) {
        const entries = readdirSync(diagDir);
        const sources = entries.filter((f) => f.endsWith('.drawio') || f.endsWith('.excalidraw'));
        const svgs = entries.filter((f) => f.endsWith('.wisp.svg'));

        for (const src of sources) {
          const svg = src.replace(/\.(drawio|excalidraw)$/, '.wisp.svg');
          expect(existsSync(join(diagDir, svg)), `Missing built ${svg} in ${post.slug}`).toBe(true);
          expect(
            post.raw.includes(`./diagrams/${src}`),
            `Orphan diagram ${src} not referenced in ${post.slug}`,
          ).toBe(true);
        }
        for (const svg of svgs) {
          const base = svg.replace(/\.wisp\.svg$/, '');
          const hasSrc =
            existsSync(join(diagDir, `${base}.drawio`)) ||
            existsSync(join(diagDir, `${base}.excalidraw`));
          expect(hasSrc, `Orphan SVG ${svg} without source in ${post.slug}`).toBe(true);
        }
      }
    }
  });

  it('passes MDX hygiene and resolves all relative links and assets', () => {
    const validRoutes = new Set<string>([
      ...allPosts.map((p) => p.route),
      '/about/',
      '/archive/',
      '/tags/',
      '/categories/',
    ]);

    const aboutFile = join(PAGES, 'about.md');
    expect(existsSync(aboutFile)).toBe(true);
    const docs = [
      ...allPosts.map((p) => ({
        file: p.file,
        dir: p.dir,
        route: p.route,
        raw: p.raw,
        body: p.body,
      })),
      {
        file: aboutFile,
        dir: dirname(aboutFile),
        route: '/about/',
        raw: readFileSync(aboutFile, 'utf8'),
        body: stripFrontmatterAndCode(readFileSync(aboutFile, 'utf8')),
      },
    ];

    for (const doc of docs) {
      expect(doc.body, `HTML comment found in ${doc.file}`).not.toContain('<!--');
      expect(doc.body, `Bare URL autolink found in ${doc.file}`).not.toMatch(/<https?:\/\//);
      expect(doc.body, `Broken ./toy.py link in ${doc.file}`).not.toContain('./toy.py)');
      expect(doc.body, `Local file:// link found in ${doc.file}`).not.toContain('file://');
      expect(doc.body, `Unsupported LaTeX delimiter in ${doc.file}`).not.toMatch(/\\[()[\]]/);

      for (const imp of doc.raw.matchAll(/^import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gm)) {
        const spec = imp[1];
        if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
        const basePath = spec.startsWith('@/')
          ? resolve(SRC, spec.slice(2))
          : resolve(doc.dir, spec);
        const candidates = [
          basePath,
          `${basePath}.tsx`,
          `${basePath}.ts`,
          `${basePath}.astro`,
          join(basePath, 'index.tsx'),
          join(basePath, 'index.ts'),
        ];
        expect(
          candidates.some((c) => existsSync(c)),
          `Missing imported asset ${spec} in ${doc.file}`,
        ).toBe(true);
      }

      const linkRe =
        /(!?)\[(?:[^[\]\r\n]|\r?\n(?!\r?\n)|\[[^[\]\r\n]*\])*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g;
      for (const match of doc.body.matchAll(linkRe)) {
        const isImg = match[1] === '!';
        const target = match[2];
        if (/^(https?:|mailto:|#)/.test(target)) continue;

        if (isImg) {
          const cleanTarget = target.split('#')[0];
          const imgPath = resolve(doc.dir, cleanTarget);
          expect(existsSync(imgPath), `Missing image ${target} in ${doc.file}`).toBe(true);
          if (cleanTarget.endsWith('.drawio') || cleanTarget.endsWith('.excalidraw')) {
            const svgPath = imgPath.replace(/\.(drawio|excalidraw)$/, '.wisp.svg');
            expect(existsSync(svgPath), `Missing compiled SVG for ${target} in ${doc.file}`).toBe(
              true,
            );
          }
          continue;
        }

        const resolvedPath = new URL(target.split('#')[0], `https://example.invalid${doc.route}`)
          .pathname;
        expect(
          validRoutes.has(resolvedPath),
          `Broken link "${target}" -> ${resolvedPath} in ${doc.file}`,
        ).toBe(true);
      }
    }
  });
});
