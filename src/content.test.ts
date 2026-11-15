import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const POSTS = join(SRC, 'content', 'posts');
const PAGES = join(SRC, 'content', 'pages');

const SERIES_EXPECTED = [
  { id: 'foundations', count: 6 },
  { id: 'distributed', count: 4 },
  { id: 'deepseek', count: 11 },
  { id: 'vllm', count: 8 },
] as const;

type SeriesId = (typeof SERIES_EXPECTED)[number]['id'];

const EXCALIDRAW_POSTS = new Set<string>([
  'foundations',
  'foundations/01-hardware-and-roofline',
  'foundations/05-quantization',
  'distributed',
  'distributed/01-interconnects-and-collectives',
  'distributed/02-parallelism-and-disaggregation',
  'distributed/03-moe-comm-and-overlap',
  'deepseek',
]);

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
  it('has exact 4-series structure, contiguous orders, and homepage ordering', () => {
    for (const { id, count } of SERIES_EXPECTED) {
      expect(bySeries[id]).toHaveLength(count);
      expect(bySeries[id].map((p) => p.series)).toEqual(
        Array.from({ length: count }, (_, idx) => ({ id, order: idx + 1 })),
      );
    }
    expect(allPosts).toHaveLength(29);

    const topDirs = readdirSync(POSTS).filter((d) => statSync(join(POSTS, d)).isDirectory());
    expect(topDirs.sort()).toEqual(['deepseek', 'distributed', 'foundations', 'vllm']);

    const orderedByUpdated = [...SERIES_EXPECTED]
      .map(({ id }) => ({
        id,
        updated: Math.max(...bySeries[id].map((p) => p.pubDateMs)),
      }))
      .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
      .map((s) => s.id);
    expect(orderedByUpdated).toEqual(['foundations', 'distributed', 'deepseek', 'vllm']);
  });

  it('has zero legacy explainer remnants or .md/.mdx sibling conflicts', () => {
    expect(existsSync(join(SRC, 'explainers'))).toBe(false);
    expect(existsSync(join(ROOT, 'design', 'explainer-kit.md'))).toBe(false);
    expect(existsSync(join(ROOT, 'design', 'citations-inventory.md'))).toBe(false);

    for (const file of listAllFiles(SRC)) {
      if (file === resolve(SRC, 'content.test.ts')) continue;
      if (/\.(ts|tsx|astro|md|mdx)$/.test(file)) {
        const text = readFileSync(file, 'utf8');
        expect(text, `Unexpected explainer import in ${file}`).not.toMatch(
          /@?\/?explainers\/|explainer-kit/,
        );
      }
    }
  });

  it('provides <=150-line toy.py and consistent rendered diagrams per post', () => {
    const chapterPosts = allPosts.filter((p) => p.series.order >= 2);
    expect(chapterPosts).toHaveLength(25);

    for (const post of allPosts) {
      const isIndex = post.series.order === 1;
      if (!isIndex) {
        const toyPath = join(post.dir, 'toy.py');
        expect(existsSync(toyPath), `Missing toy.py in ${post.slug}`).toBe(true);
        const toyLines = readFileSync(toyPath, 'utf8').trimEnd().split(/\r?\n/);
        expect(toyLines.length, `toy.py > 150 lines in ${post.slug}`).toBeLessThanOrEqual(150);
      }

      const diagDir = join(post.dir, 'diagrams');
      expect(existsSync(diagDir), `Missing diagrams/ in ${post.slug}`).toBe(true);
      const entries = readdirSync(diagDir);
      const drawios = entries.filter((f) => f.endsWith('.drawio'));
      const excalidraws = entries.filter((f) => f.endsWith('.excalidraw'));

      if (EXCALIDRAW_POSTS.has(post.slug)) {
        expect(drawios, `Expected Excalidraw-only in ${post.slug}`).toHaveLength(0);
        expect(excalidraws.length).toBeGreaterThanOrEqual(isIndex ? 1 : 3);
      } else {
        expect(excalidraws, `Expected drawio-only in ${post.slug}`).toHaveLength(0);
        expect(drawios.length).toBeGreaterThanOrEqual(isIndex ? 1 : 3);
      }

      for (const src of [...drawios, ...excalidraws]) {
        const svg = src.replace(/\.(drawio|excalidraw)$/, '.wisp.svg');
        expect(existsSync(join(diagDir, svg)), `Missing built ${svg} in ${post.slug}`).toBe(true);
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

      for (const imp of doc.raw.matchAll(/^import\s+\w+\s+from\s+['"](\.[^'"]+)['"]/gm)) {
        const assetPath = resolve(doc.dir, imp[1]);
        expect(existsSync(assetPath), `Missing imported asset ${imp[1]} in ${doc.file}`).toBe(true);
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
