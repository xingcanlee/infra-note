import { test, expect } from '@playwright/test';

const URL = '/posts/kitchen-sink/';

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
});

test('Mermaid：6 个 .wisp-pele，各含 SVG', async ({ page }) => {
  await expect(page.locator('.wisp-pele')).toHaveCount(6);
  await expect(page.locator('.wisp-pele svg')).toHaveCount(6);
});

test('KaTeX 公式存在', async ({ page }) => {
  expect(await page.locator('.katex').count()).toBeGreaterThan(0);
  await expect(page.locator('.katex-display').first()).toBeVisible();
});

test('代码块有行号（::before 计数器）', async ({ page }) => {
  const pre = page.locator('pre.wisp-ln').first();
  await expect(pre).toBeVisible();
  const content = await pre.locator('.line').first().evaluate((el) => getComputedStyle(el, '::before').content);
  expect(content).toMatch(/counter|\d/);
  expect(content).not.toBe('none');
});

test('复制按钮复制的文本不含行号', async ({ page, context, browserName }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pre = page.locator('pre.wisp-ln').first();
  const btn = pre.locator('xpath=..').locator('.wisp-copy');
  await pre.hover();
  await btn.click();
  await expect(btn).toHaveAttribute('data-done', '');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const expected = await pre.locator('code').evaluate((c) => c.textContent ?? '');
  expect(copied.length).toBeGreaterThan(0);
  expect(copied).toBe(expected);
  // 每行都不应以行号开头
  for (const l of copied.split('\n')) expect(l).not.toMatch(/^\s*\d+\s*$/);
  await expect(btn.locator('xpath=following-sibling::span[@role="status"]')).toHaveText('已复制');
});

test('图表 figure 存在，下载链接返回 200', async ({ page, request }) => {
  const figs = page.locator('figure.wisp-diagram');
  expect(await figs.count()).toBeGreaterThanOrEqual(2);
  const links = page.locator('a.wisp-diagram-dl');
  const n = await links.count();
  expect(n).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < n; i++) {
    const href = await links.nth(i).getAttribute('href');
    expect((await request.get(href!)).status(), href!).toBe(200);
  }
});

test('页面中所有 id 唯一', async ({ page }) => {
  const dup = await page.evaluate(() => {
    const seen = new Map<string, number>();
    document.querySelectorAll('[id]').forEach((e) => seen.set(e.id, (seen.get(e.id) ?? 0) + 1));
    return [...seen].filter(([, c]) => c > 1).map(([id, c]) => `${id} ×${c}`);
  });
  expect(dup).toEqual([]);
});

test('TOC 链接能跳转到对应标题', async ({ page }) => {
  const links = page.locator('nav.wisp-toc-aside a[data-toc-link]');
  const n = await links.count();
  expect(n).toBeGreaterThan(3);
  for (const i of [1, Math.floor(n / 2), n - 1]) {
    const link = links.nth(i);
    if (!(await link.isVisible())) continue;
    const href = (await link.getAttribute('href'))!;
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${encodeURI(decodeURIComponent(href)).replace('#', '#')}$`));
    const target = page.locator(`[id="${decodeURIComponent(href.slice(1))}"]`);
    await expect(target).toBeInViewport();
  }
});
