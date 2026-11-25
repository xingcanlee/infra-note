import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const POSTS = join(SRC, 'content', 'posts');
const ABOUT = join(SRC, 'content', 'pages', 'about.md');
const EXPLAINERS = join(SRC, 'explainers');

const BANNED_STYLE_RE =
  /(的轴|条轴|稀疏轴|扩展轴|演化轴|正交轴|账本|配方|物化|全景|全解|解剖|机理|暴涨|暴降|闭环|收口|收束|走查|合拢|各司其职|抓手)/g;
const TITLE_BANNED_RE = /(的轴|条轴|稀疏轴|扩展轴|演化轴|正交轴|账本|配方|全景|全解|解剖|机理)/;
const VISUAL_BANNED_RE = /(账本|配方|物化|全景|全解|解剖|机理|暴涨|暴降)/g;
const PLAIN_O_RE = /(?<![A-Za-z0-9_])O\([^)\n]+\)/;
const SNAKE_ID_RE = /\b[a-zA-Z]+_[a-zA-Z0-9_]+\b/;
const INLINE_MATH_RE = /(?<![\\$\w])\$(?![\s$])[^$\n]+?(?<![\s\\])\$(?![\d$])/g;

interface DocEntry {
  label: string;
  raw: string;
  isGuide: boolean;
}

function listFiles(dir: string, pred: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full, pred));
    } else if (pred(full)) {
      out.push(full);
    }
  }
  return out.sort();
}

function loadDocs(): DocEntry[] {
  const mdxFiles = listFiles(POSTS, (f) => f.endsWith('.mdx'));
  const docs: DocEntry[] = mdxFiles.map((file) => {
    const raw = readFileSync(file, 'utf8');
    const isGuide = /series:\s*\{\s*id:\s*[a-z0-9-]+\s*,\s*order:\s*1\s*\}/.test(raw);
    return { label: relative(ROOT, file).replace(/\\/g, '/'), raw, isGuide };
  });
  docs.push({
    label: relative(ROOT, ABOUT).replace(/\\/g, '/'),
    raw: readFileSync(ABOUT, 'utf8'),
    isGuide: true,
  });
  return docs;
}

function parseFrontmatterField(raw: string, key: string): string {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fmMatch) return '';
  const re = new RegExp(`^${key}:\\s*(['"])([\\s\\S]*?)\\1\\s*$`, 'm');
  const m = re.exec(fmMatch[1]);
  return m ? m[2] : '';
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function toVisibleText(input: string): string {
  let s = input;
  s = s.replace(/\$\$[\s\S]*?\$\$/g, 'X');
  s = s.replace(INLINE_MATH_RE, 'X');
  s = s.replace(/\[\^[^\]]+\]/g, '');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/\*\*/g, '');
  s = s.replace(/`([^`]+)`/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

function extractMermaidText(rawBody: string): string {
  const parts: string[] = [];
  for (const m of rawBody.matchAll(/^```mermaid\b[^\n]*\n([\s\S]*?)^```/gm)) {
    parts.push(m[0].replace(/\$\$[^$\n]+?\$\$/g, ''));
  }
  return parts.join('\n');
}

function extractJsxAttrs(rawBody: string): string {
  const parts: string[] = [];
  for (const m of rawBody.matchAll(/<(?:Figure|[A-Z]\w*Explainer)\b[\s\S]*?\/>/g)) {
    for (const attr of m[0].matchAll(/\b(?:alt|caption|title)\s*=\s*"([^"]*)"/g)) {
      parts.push(attr[1]);
    }
  }
  return parts.join('\n');
}

function cleanBodyForScan(rawBody: string): string {
  const mermaid = extractMermaidText(rawBody);
  const jsxAttrs = extractJsxAttrs(rawBody);
  let s = rawBody;
  s = s.replace(/^```[\s\S]*?^```/gm, '');
  s = s.replace(/^import\s+[\s\S]*?;\s*$/gm, '');
  s = s.replace(/<(?:Figure|[A-Z]\w*Explainer)\b[\s\S]*?\/>/g, '');
  s = s.replace(/\$\$[\s\S]*?\$\$/g, '');
  s = s.replace(INLINE_MATH_RE, '');
  s = s.replace(/!\[/g, '[');
  s = s.replace(/\]\([^)]*\)/g, ']()');
  return `${s}\n${mermaid}\n${jsxAttrs}`;
}

function splitParagraphBlocks(rawBody: string): string[] {
  let s = rawBody;
  s = s.replace(/^```[\s\S]*?^```/gm, '');
  s = s.replace(/\$\$[\s\S]*?\$\$/g, '');
  s = s.replace(/^import\s+[\s\S]*?;\s*$/gm, '');
  s = s.replace(/^export\s+[\s\S]*?;\s*$/gm, '');
  s = s.replace(/<(?:Figure|[A-Z]\w*Explainer)\b[\s\S]*?\/>/g, '');
  return s.split(/\r?\n\s*\r?\n/);
}

function collectListItems(block: string): string[] {
  const items: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      items.push(line.trim());
    } else if (items.length > 0 && line.trim()) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }
  return items;
}

const docs = loadDocs();

describe('infra-note writing style gate', () => {
  it('enforces concise, natural titles and h2-h4 headings', () => {
    const violations: string[] = [];

    for (const doc of docs) {
      const title = parseFrontmatterField(doc.raw, 'title');
      const maxTitle = doc.isGuide ? 34 : 32;
      if (!title) {
        violations.push(`${doc.label}: missing title`);
      } else {
        if (title.length > maxTitle) {
          violations.push(`${doc.label}: title too long (${title.length} > ${maxTitle}): ${title}`);
        }
        if (PLAIN_O_RE.test(title)) {
          violations.push(`${doc.label}: title contains plain O(...): ${title}`);
        }
        if (SNAKE_ID_RE.test(title)) {
          violations.push(`${doc.label}: title contains underscore identifier: ${title}`);
        }
        if (TITLE_BANNED_RE.test(title)) {
          violations.push(`${doc.label}: title contains banned calque: ${title}`);
        }
      }

      const body = stripFrontmatter(doc.raw).replace(/^```[\s\S]*?^```/gm, '');
      for (const m of body.matchAll(/^(#{2,4})\s+(.+)$/gm)) {
        const rawH = m[2].trim();
        const rawNoMath = rawH.replace(INLINE_MATH_RE, '');
        if (rawH.includes('`')) {
          violations.push(`${doc.label}: heading contains backticks: ${rawH}`);
        }
        if (PLAIN_O_RE.test(rawNoMath)) {
          violations.push(`${doc.label}: heading contains plain O(...): ${rawH}`);
        }
        if (SNAKE_ID_RE.test(rawNoMath)) {
          violations.push(`${doc.label}: heading contains underscore identifier: ${rawH}`);
        }
        if (TITLE_BANNED_RE.test(rawH)) {
          violations.push(`${doc.label}: heading contains banned word: ${rawH}`);
        }
        const visH = toVisibleText(rawH);
        if (visH.length > 24) {
          violations.push(`${doc.label}: heading too long (${visH.length} > 24): ${visH}`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('keeps paragraphs, sentences, lists, and symbol density within human-readable bounds', () => {
    const violations: string[] = [];

    for (const doc of docs) {
      const body = stripFrontmatter(doc.raw);
      for (const rawBlock of splitParagraphBlocks(body)) {
        const block = rawBlock.trim();
        if (
          !block ||
          block.startsWith('#') ||
          block.startsWith('|') ||
          block.startsWith('!') ||
          block.startsWith('<') ||
          block.startsWith('[^') ||
          block.startsWith('>') ||
          block === '---'
        ) {
          continue;
        }

        if (/^(?:[-*]|\d+\.)\s+/.test(block)) {
          const maxItemLen = doc.isGuide ? 140 : 110;
          for (const item of collectListItems(block)) {
            const stripped = item.replace(/^(?:[-*]|\d+\.)\s+/, '');
            const vis = toVisibleText(stripped);
            if (/^\*\*[^*]+\*\*[：:]/.test(stripped) && vis.length > 75) {
              violations.push(
                `${doc.label}: PPT bold-lead bullet (${vis.length} > 75): ${vis.slice(0, 60)}`,
              );
            }
            if (vis.length > maxItemLen) {
              violations.push(
                `${doc.label}: list item too long (${vis.length} > ${maxItemLen}): ${vis.slice(0, 60)}`,
              );
            }
          }
          continue;
        }

        const para = block.replace(/\r?\n/g, '');
        const vis = toVisibleText(para);
        if (vis.length > 255) {
          violations.push(
            `${doc.label}: paragraph too long (${vis.length} > 255): ${vis.slice(0, 60)}`,
          );
        }

        const inlineCodes = para.match(/`[^`]+`/g) ?? [];
        if (inlineCodes.length > 6) {
          violations.push(
            `${doc.label}: too many inline code spans in paragraph (${inlineCodes.length} > 6): ${vis.slice(0, 60)}`,
          );
        }
        const privId = inlineCodes.find((c) => /^`_[a-zA-Z0-9_]+`$/.test(c));
        if (privId) {
          violations.push(`${doc.label}: underscore-prefixed private symbol in prose: ${privId}`);
        }

        const noSymbols = para
          .replace(/\$\$[\s\S]*?\$\$/g, '')
          .replace(INLINE_MATH_RE, '')
          .replace(/`[^`]+`/g, '')
          .replace(/\[\^[^\]]+\]/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        const parens = noSymbols.match(/[（(]/g) ?? [];
        if (parens.length > 3) {
          violations.push(
            `${doc.label}: too many parentheticals in paragraph (${parens.length} > 3): ${vis.slice(0, 60)}`,
          );
        }

        for (const rawSent of vis.split(/[。！？]/)) {
          const sent = rawSent.trim();
          if (!sent) continue;
          if (sent.length > 98) {
            violations.push(
              `${doc.label}: sentence too long (${sent.length} > 98): ${sent.slice(0, 65)}`,
            );
          }
          const semis = sent.match(/；/g) ?? [];
          if (semis.length > 1) {
            violations.push(`${doc.label}: >1 semicolons in single sentence: ${sent.slice(0, 65)}`);
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('enforces unified quotes, clean vocabulary, no exclamation marks, and concise python blocks', () => {
    const violations: string[] = [];

    for (const doc of docs) {
      const body = stripFrontmatter(doc.raw);
      const scanText = cleanBodyForScan(body);
      const scanNoCode = scanText.replace(/`[^`]+`/g, '');

      if (/[「」『』]/.test(scanNoCode)) {
        violations.push(`${doc.label}: corner quotes 「」『』 found`);
      }
      if (/[！!]/.test(scanNoCode)) {
        violations.push(`${doc.label}: exclamation mark found in prose/visual text`);
      }
      const btNum = scanText.match(/(?<!`)`(\d+(?:\.\d+)?)`(?!`)/g);
      if (btNum) {
        violations.push(`${doc.label}: plain number wrapped in backticks: ${btNum.join(', ')}`);
      }
      const bannedHits = [...new Set([...scanNoCode.matchAll(BANNED_STYLE_RE)].map((m) => m[1]))];
      if (bannedHits.length > 0) {
        violations.push(`${doc.label}: banned style word(s): ${bannedHits.join(', ')}`);
      }
      const kernelCheck = scanNoCode.replace(/(?:操作系统|Linux|OS|宏|微)\s*内核/gi, '');
      if (kernelCheck.includes('内核')) {
        violations.push(`${doc.label}: banned word "内核" (use Kernel/算子)`);
      }

      for (const py of body.matchAll(/^```python\b[^\n]*\n([\s\S]*?)^```/gm)) {
        const lineCount = py[1].trimEnd().split(/\r?\n/).length;
        if (lineCount > 90) {
          violations.push(`${doc.label}: python block too long (${lineCount} > 90 lines)`);
        }
      }

      const strippedMermaid = extractMermaidText(body);
      if (/[_^]\{[^}]+\}/.test(strippedMermaid)) {
        violations.push(
          `${doc.label}: bare TeX brace subscript/superscript outside $$...$$ in mermaid`,
        );
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('keeps diagrams and interactive explainers free of corner quotes and banned calques', () => {
    const violations: string[] = [];
    const diagramFiles = listFiles(
      POSTS,
      (f) => f.endsWith('.drawio') || f.endsWith('.excalidraw'),
    );
    const sharedExplainerFiles = listFiles(
      EXPLAINERS,
      (f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'),
    );
    const postExplainerFiles = listFiles(
      POSTS,
      (f) => /[\\/]explainers[\\/]/.test(f) && /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'),
    );

    for (const file of [...diagramFiles, ...sharedExplainerFiles, ...postExplainerFiles]) {
      const raw = readFileSync(file, 'utf8');
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (/[「」『』]/.test(raw)) {
        violations.push(`${rel}: corner quotes 「」『』 found`);
      }
      const banned = [...new Set([...raw.matchAll(VISUAL_BANNED_RE)].map((m) => m[1]))];
      if (banned.length > 0) {
        violations.push(`${rel}: banned visual word(s): ${banned.join(', ')}`);
      }
      const kernelCheck = raw.replace(/(?:操作系统|Linux|OS|宏|微)\s*内核/gi, '');
      if (kernelCheck.includes('内核')) {
        violations.push(`${rel}: banned word "内核"`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
