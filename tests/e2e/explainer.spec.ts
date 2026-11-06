import { test, expect } from '@playwright/test';

const URL = '/posts/matrix-multiplication/';

test('MatMul hydrate，键盘 → 前进，caption 的 aria-live 文本变化', async ({ page }) => {
  await page.goto(URL);
  const player = page.locator('.wisp-player').first();
  await player.scrollIntoViewIfNeeded();
  await expect(player).toBeVisible();
  const caption = player.locator('.wisp-player__caption');
  await expect(caption).toHaveAttribute('aria-live', 'polite');
  const before = await caption.textContent();
  await player.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => caption.textContent()).not.toBe(before);
  const count = player.locator('.wisp-player__count');
  await expect(count).toContainText(/^2 \//);
  await page.keyboard.press('ArrowLeft');
  await expect(count).toContainText(/^1 \//);
});

test.describe('reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('播放按钮禁用，不会自动播放', async ({ page }) => {
    await page.goto(URL);
    const player = page.locator('.wisp-player').first();
    await player.scrollIntoViewIfNeeded();
    const play = player.locator('.wisp-player__play');
    await expect(play).toBeDisabled();
    await expect(play).toHaveAttribute('aria-label', /减少动态效果/);
    const count = player.locator('.wisp-player__count');
    const before = await count.textContent();
    await page.waitForTimeout(2500);
    await expect(count).toHaveText(before!);
  });
});
