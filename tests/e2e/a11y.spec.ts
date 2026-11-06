import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '/', '/posts/kitchen-sink/', '/posts/attention-explained/', '/posts/matrix-multiplication/',
  '/tags/', '/tags/' + encodeURI('线性代数') + '/', '/archive/',
];


for (const theme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`axe ${theme} ${decodeURI(path)}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => localStorage.setItem('wisp-theme', t), theme);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
      // 触发 client:visible 的岛屿并等待其渲染
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const report = bad.map((v) => `${v.id} [${v.impact}] ${v.nodes.length} 处\n` + v.nodes.slice(0, 4).map((n) => `   ${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(0, 2).join(' | ')}`).join('\n'));
      expect(report).toEqual([]);
    });
  }
}
