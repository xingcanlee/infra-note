import { test, expect, type Locator } from '@playwright/test';

const URL = '/posts/kitchen-sink/';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
});

const folded = (page: import('@playwright/test').Page) => page.locator('.wisp-code[data-fold]').first();
const lineHeight = (box: Locator) => box.locator('pre').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));

test('长代码块默认折叠，可见高度约为 previewLines 行', async ({ page }) => {
  const box = folded(page);
  await expect(box).toHaveAttribute('data-folded', '');
  const btn = box.locator('.wisp-fold');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toContainText('展开全部 40 行');
  const preH = (await box.locator('pre').boundingBox())!.height;
  const lh = await lineHeight(box);
  const pt = await box.locator('pre').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  // 上内边距 + 12 行 + 半行余量
  expect(preH).toBeGreaterThan(pt + lh * 12);
  expect(preH).toBeLessThan(pt + lh * 13);
  const full = await box.locator('code').evaluate((c) => c.getBoundingClientRect().height);
  expect(full).toBeGreaterThan(preH * 2);
});

test('aria-controls 指向 pre', async ({ page }) => {
  const box = folded(page);
  const id = await box.locator('.wisp-fold').getAttribute('aria-controls');
  expect(id).toBeTruthy();
  await expect(box.locator('pre')).toHaveAttribute('id', id!);
});

test('点击展开显示全部，再次点击收起', async ({ page }) => {
  const box = folded(page);
  const btn = box.locator('.wisp-fold');
  const folded0 = (await box.locator('pre').boundingBox())!.height;
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(btn).toContainText('收起');
  await expect(box).not.toHaveAttribute('data-folded', '');
  const code = (await box.locator('code').boundingBox())!.height;
  const open = (await box.locator('pre').boundingBox())!.height;
  expect(open).toBeGreaterThanOrEqual(code);
  expect(open).toBeGreaterThan(folded0 * 2);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(box).toHaveAttribute('data-folded', '');
  expect((await box.locator('pre').boundingBox())!.height).toBeCloseTo(folded0, 0);
});

test('收起时若按钮已滚出视口，会被滚回可见位置', async ({ page }) => {
  const box = folded(page);
  const btn = box.locator('.wisp-fold');
  await btn.click();
  await page.evaluate(() => window.scrollTo(0, 0)); // 展开后的按钮在视口之外
  expect(await btn.evaluate((b) => b.getBoundingClientRect().top > innerHeight)).toBe(true);
  await btn.evaluate((b: HTMLElement) => b.click());
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(btn).toBeInViewport({ ratio: 1 });
});

test('nofold 的长代码块不折叠，也没有展开按钮', async ({ page }) => {
  const box = page.locator('.wisp-code[data-lines="40"]:not([data-fold])');
  await expect(box).toHaveCount(1);
  await expect(box.locator('.wisp-fold')).toHaveCount(0);
  await expect(box).not.toHaveAttribute('data-folded', '');
});

test('短代码块没有折叠按钮，但有复制按钮', async ({ page }) => {
  const box = page.locator('.wisp-code[data-lines="4"]').first();
  await expect(box.locator('.wisp-fold')).toHaveCount(0);
  await expect(box.locator('.wisp-copy')).toHaveCount(1);
});

test('复制按钮使用图标，成功后切换为勾并播报“已复制”', async ({ page }) => {
  const box = page.locator('.wisp-code[data-lines="4"]').first();
  const btn = box.locator('.wisp-copy');
  await expect(btn).toHaveAttribute('aria-label', '复制代码');
  await expect(btn.locator('svg')).toHaveCount(1);
  await expect(btn).toHaveText('');
  const before = await btn.innerHTML();
  await box.hover();
  await btn.click();
  await expect(btn).toHaveAttribute('data-done', '');
  expect(await btn.innerHTML()).not.toBe(before);
  await expect(box.locator('[role=status]')).toHaveText('已复制');
  await expect(btn).not.toHaveAttribute('data-done', '', { timeout: 4000 });
  await expect(box.locator('[role=status]')).toHaveText('');
});

test('折叠态下复制得到完整代码', async ({ page }) => {
  const box = folded(page);
  await expect(box).toHaveAttribute('data-folded', '');
  await box.hover();
  await box.locator('.wisp-copy').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const expected = await box.locator('code').evaluate((c) => c.textContent ?? '');
  expect(copied.split('\n').length).toBeGreaterThanOrEqual(40);
  expect(copied).toBe(expected);
  expect(copied).toContain('step40');
});

test('键盘可以操作：Tab 聚焦，Enter / Space 展开收起', async ({ page }) => {
  const box = folded(page);
  const btn = box.locator('.wisp-fold');
  await btn.focus();
  await expect(btn).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  // 复制按钮在 Tab 序列中可达
  const copy = box.locator('.wisp-copy');
  await copy.focus();
  await expect(copy).toBeFocused();
  await expect(copy).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(copy).toHaveAttribute('data-done', '');
});

test('无 JS 时折叠块完整显示、没有按钮', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL);
  const box = page.locator('.wisp-code[data-fold]').first();
  await expect(box).not.toHaveAttribute('data-folded', '');
  await expect(box.locator('.wisp-fold')).toHaveCount(0);
  const pre = (await box.locator('pre').boundingBox())!.height;
  const code = (await box.locator('code').boundingBox())!.height;
  expect(pre).toBeGreaterThanOrEqual(code);
  await ctx.close();
});

test('打印时折叠块完整显示', async ({ page }) => {
  const box = folded(page);
  await page.emulateMedia({ media: 'print' });
  const pre = (await box.locator('pre').boundingBox())!.height;
  const code = (await box.locator('code').boundingBox())!.height;
  expect(pre).toBeGreaterThanOrEqual(code);
});

test('折叠态下行号和横向滚动仍可用', async ({ page }) => {
  const box = folded(page);
  const pre = box.locator('pre');
  const content = await pre.locator('.line').first().evaluate((el) => getComputedStyle(el, '::before').content);
  expect(content).not.toBe('none');
  expect(await pre.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
});
