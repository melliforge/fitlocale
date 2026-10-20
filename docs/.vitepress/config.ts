import { defineConfig } from 'vitepress';

const SITE = 'https://melliforge.github.io/localization-layout-tester/';
const REPO = 'https://github.com/melliforge/localization-layout-tester';
const DESCRIPTION = 'Catch layout bugs caused by translation (truncation, overflow, untranslated text, right-to-left) in your Playwright tests.';

export default defineConfig({
  title: 'fitlocale',
  description: DESCRIPTION,
  lang: 'en',
  base: '/localization-layout-tester/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://melliforge.github.io/localization-layout-tester/' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/localization-layout-tester/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'fitlocale' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
  ],
  // Each page's own title and description, for link previews.
  transformPageData(page) {
    const title = page.frontmatter.title ?? page.title;
    const description = page.frontmatter.description ?? DESCRIPTION;
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: SITE + page.relativePath.replace(/(index)?\.md$/, '') }],
    );
  },
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Guides', link: '/guides/rtl-testing-playwright' },
      { text: 'Reference', link: '/reference/rules' },
      { text: 'Changelog', link: `${REPO}/blob/main/CHANGELOG.md` },
      { text: 'npm', link: 'https://www.npmjs.com/package/fitlocale' },
    ],
    sidebar: [
      { text: 'Getting started', items: [{ text: 'Install and first check', link: '/guide/getting-started' }] },
      {
        text: 'Guides',
        items: [
          { text: 'Test RTL layout in Playwright', link: '/guides/rtl-testing-playwright' },
          { text: 'Catch text truncation in CI', link: '/guides/text-truncation-ci' },
          { text: 'Pseudo-localization with i18next', link: '/guides/pseudo-localization-i18next' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Rules', link: '/reference/rules' },
          { text: 'Options', link: '/reference/options' },
          { text: 'CLI', link: '/reference/cli' },
          { text: 'GitHub Action', link: '/reference/github-action' },
          { text: 'Results format', link: '/reference/results' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: REPO }],
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: { message: 'Released under the MIT License.' },
  },
});
