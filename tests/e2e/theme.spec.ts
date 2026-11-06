/**
 * 主题首屏无闪烁（T8）。
 * 在首帧（第一个 requestAnimationFrame，渲染被样式表阻塞，因此此刻即首次绘制前的状态）读取
 * <html data-theme> 与背景色，确认 head 内联脚本在样式之前就写入了已解析的主题。
 *
 * 服务器由 playwright.config.ts 的 webServer 统一启动（或用 WISP_BASE_URL 指向已有服务器）。
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = ''; // 相对 baseURL
const PATHS = ['/', '/posts/kitchen-sink/'];

/** 在首帧记录主题与背景色；禁用缓存，保证每次都是冷加载。 */
async function firstFrame(page: Page, path: string) {
  await page.route('**/*', (route) => route.continue()); // 拦截所有请求 = 禁用 HTTP 缓存
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      const html = document.documentElement;
      (window as any).__wispFirstFrame = {
        theme: html.dataset.theme,
        pref: html.dataset.themePref,
        bg: getComputedStyle(html).backgroundColor,
        bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : null,
        token: getComputedStyle(html).getPropertyValue('--wisp-bg').trim(),
      };
    });
  });
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__wispFirstFrame);
  return page.evaluate(() => (window as any).__wispFirstFrame as {
    theme: string;
    pref: string;
    bg: string;
    bodyBg: string | null;
    token: string;
  });
}

/** rgb(a) / color(srgb …) → 相对亮度 0..1 */
function luminance(css: string): number {
  const nums = css.match(/[\d.]+/g)!.map(Number);
  const [r, g, b] = css.startsWith('color(') ? nums.slice(0, 3) : nums.slice(0, 3).map((v) => v / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

for (const path of PATHS) {
  test.describe(`首帧主题 ${path}`, () => {
    test('localStorage=dark → 首帧即暗色', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.addInitScript(() => localStorage.setItem('wisp-theme', 'dark'));
      const f = await firstFrame(page, path);
      expect(f.theme).toBe('dark');
      expect(f.pref).toBe('dark');
      expect(f.bg).toBe(hexToRgb(f.token));
      expect(luminance(f.bg)).toBeLessThan(0.05);
    });

    test('system + prefers-color-scheme: dark → 首帧即暗色', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      const f = await firstFrame(page, path);
      expect(f.theme).toBe('dark');
      expect(f.pref).toBe('system');
      expect(f.bg).toBe(hexToRgb(f.token));
      expect(luminance(f.bg)).toBeLessThan(0.05);
    });

    test('localStorage=light 覆盖系统暗色 → 首帧即亮色', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.addInitScript(() => localStorage.setItem('wisp-theme', 'light'));
      const f = await firstFrame(page, path);
      expect(f.theme).toBe('light');
      expect(luminance(f.bg)).toBeGreaterThan(0.8);
    });

    test('system + prefers-color-scheme: light → 首帧即亮色', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      const f = await firstFrame(page, path);
      expect(f.theme).toBe('light');
      expect(f.pref).toBe('system');
      expect(luminance(f.bg)).toBeGreaterThan(0.8);
    });
  });
}

test('主题按钮在 light → dark → system 间循环并持久化', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('wisp-theme', 'light');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto(BASE + '/');
  const btn = page.locator('[data-wisp-theme-toggle]');
  const html = page.locator('html');
  await expect(btn).toHaveAttribute('aria-label', /浅色/);
  await expect(html).toHaveAttribute('data-theme', 'light');

  await btn.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-theme-pref', 'dark');
  await expect(btn).toHaveAttribute('aria-label', /深色/);

  await btn.click();
  await expect(html).toHaveAttribute('data-theme-pref', 'system');
  await expect(html).toHaveAttribute('data-theme', 'dark'); // 系统为暗色
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light'); // system 模式跟随 matchMedia 变化

  await btn.click();
  await expect(html).toHaveAttribute('data-theme-pref', 'light');
  expect(await page.evaluate(() => localStorage.getItem('wisp-theme'))).toBe('light');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('键盘：首个 Tab 聚焦“跳到正文”，回车后焦点进入 main', async ({ page }) => {
  await page.goto(BASE + '/posts/kitchen-sink/');
  await page.keyboard.press('Tab');
  const skip = page.locator('a.wisp-skip');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator('#main')).toBeFocused();
});
