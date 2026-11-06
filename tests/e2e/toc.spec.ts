/**
 * 文章页目录侧栏、阅读进度条、返回顶部（U2）。
 * 目录侧栏只在 ≥ 1200px 显示，所以涉及侧栏的用例只在 desktop 项目（1280）运行；返回顶部两个项目都跑。
 */
import { test, expect } from '@playwright/test';

const POST = '/posts/kitchen-sink/';

test.describe('desktop toc', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', '侧栏仅 ≥ 1200px');
  });

  test('收起后刷新仍保持收起，且首帧不闪烁', async ({ page }) => {
    await page.goto(POST);
    const toggle = page.locator('.wisp-toc-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#wisp-toc-list')).toBeVisible();
    const x0 = (await page.locator('.wisp-post-body').boundingBox())!.x;

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#wisp-toc-list')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('wisp-toc-collapsed'))).toBe('1');
    expect((await page.locator('.wisp-post-body').boundingBox())!.x).toBe(x0); // 正文不跳动

    // 刷新：首帧（第一个 rAF）就应是收起态
    await page.addInitScript(() => {
      requestAnimationFrame(() => {
        const l = document.getElementById('wisp-toc-list');
        (window as any).__tocFirst = {
          attr: document.documentElement.dataset.toc,
          display: l ? getComputedStyle(l).display : 'missing',
        };
      });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => (window as any).__tocFirst);
    const first = await page.evaluate(() => (window as any).__tocFirst);
    expect(first.attr).toBe('collapsed');
    expect(first.display).toBe('none');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click(); // 再展开
    await expect(page.locator('#wisp-toc-list')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('wisp-toc-collapsed'))).toBe('0');
  });

  test('滚动到 h2 后其 h3 分组展开，高亮项在目录可视区域内', async ({ page }) => {
    await page.goto(POST);
    const group = page.locator('.wisp-toc-aside li[data-group]').first();
    const sub = group.locator('> ol');
    await expect(group).not.toHaveAttribute('data-open', '');
    await expect(sub).toBeHidden();

    const slug = await group.locator('> .wisp-toc-row > a').getAttribute('data-toc-link');
    await page.evaluate((id) => document.getElementById(id!)!.scrollIntoView(), slug);
    await expect(group).toHaveAttribute('data-open', '');
    await expect(sub).toBeVisible();
    await expect(group.locator('.wisp-toc-sub-toggle')).toHaveAttribute('aria-expanded', 'true');

    // 滚到末尾：高亮项必须落在目录容器内
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const cur = page.locator('.wisp-toc-aside [aria-current="true"]');
    await expect(cur).toHaveCount(1);
    const inside = await page.evaluate(() => {
      const box = document.querySelector('.wisp-post-aside-inner')!.getBoundingClientRect();
      const r = document.querySelector('.wisp-toc-aside [aria-current="true"]')!.getBoundingClientRect();
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    });
    expect(inside).toBe(true);
  });

  test('手动点 chevron 展开和收起 h3', async ({ page }) => {
    await page.goto(POST);
    const group = page.locator('.wisp-toc-aside li[data-group]').first();
    const btn = group.locator('.wisp-toc-sub-toggle');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(group.locator('> ol')).toBeVisible();
    await btn.click();
    await expect(group.locator('> ol')).toBeHidden();
  });
});

for (const [name, width, height] of [['1280', 1280, 800], ['375', 375, 812]] as const) {
  test.describe(`宽度 ${name}`, () => {
    test.use({ viewport: { width, height } });
    test('阅读进度条随滚动增加', async ({ page }) => {
      await page.goto(POST);
      const bar = page.locator('[data-reading-progress]');
      await expect(bar).toHaveAttribute('aria-hidden', 'true');
      const w = async () => (await bar.boundingBox())?.width ?? 0;
      const vw = page.viewportSize()!.width;
      await expect.poll(w).toBeLessThan(2);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
      await expect.poll(w).toBeGreaterThan(vw * 0.1);
      const mid = await w();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect.poll(w).toBeGreaterThan(mid);
      expect(await w()).toBeLessThanOrEqual(vw + 1);
    });

    test('滚动后出现返回顶部按钮，点击后回到顶部', async ({ page }) => {
      await page.goto(POST);
      const btn = page.getByRole('button', { name: '返回顶部' });
      await expect(btn).toBeHidden();
      await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
      await expect(btn).toBeVisible();
      await btn.click();
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      await expect(btn).toBeHidden();
      await expect(page.locator('h1')).toBeFocused();
    });
  });
}

test.describe('375 宽度的 details 目录', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('窄屏显示 details 目录，侧栏不可见', async ({ page }) => {
    await page.goto(POST);
    const d = page.locator('details.wisp-toc-inline');
    await expect(d).toBeVisible();
    await d.locator('summary').click();
    await expect(d).toHaveAttribute('open', '');
    await expect(page.locator('.wisp-post-aside')).toBeHidden();
  });
});
