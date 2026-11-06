import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import wisp from './src/wisp/integration';
import wispConfig from './src/wisp.config';

export default defineConfig({
  site: wispConfig.site.url,
  integrations: [wisp(wispConfig), mdx(), react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
