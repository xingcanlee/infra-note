import { test, expect } from '@playwright/test';

const OK = [
  '/', '/archive/', '/tags/', '/categories/', '/about/',
  '/posts/kitchen-sink/', '/posts/attention-explained/', '/posts/matrix-multiplication/',
  '/posts/welcome-to-wisp/', '/posts/rust-ownership/', '/posts/english-post/',
  '/tags/rust/', '/tags/' + encodeURI('线性代数') + '/', '/tags/' + encodeURI('示例') + '/',
  '/categories/' + encodeURI('机器学习') + '/', '/categories/' + encodeURI('算法') + '/',
  '/rss.xml', '/sitemap-index.xml', '/sitemap-0.xml',
  '/diagrams/kitchen-sink/attention-flow.excalidraw', '/diagrams/shared/transformer-block.drawio',
];

for (const path of OK) {
  test(`200 ${decodeURI(path)}`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
  });
}

test('/page/2/ 仅在文章数超过一页时存在（存在则 200）', async ({ request }) => {
  const res = await request.get('/page/2/');
  expect([200, 404]).toContain(res.status());
});

test('不存在的路径 404 并渲染自定义 404 页', async ({ page }) => {
  const res = await page.goto('/nonexistent');
  expect(res?.status()).toBe(404);
  await expect(page.locator('main')).toBeVisible();
});

test('草稿文章不在生产构建中', async ({ request, page }) => {
  expect((await request.get('/posts/draft-notes/')).status()).toBe(404);
  for (const p of ['/', '/archive/', '/rss.xml', '/sitemap-0.xml']) {
    expect(await (await request.get(p)).text()).not.toContain('draft-notes');
  }
  await page.goto('/archive/');
  await expect(page.locator('a[href*="draft-notes"]')).toHaveCount(0);
});
