import { defineConfig } from 'vitepress';

const SITE = 'https://melliforge.github.io/fitlocale/';
const REPO = 'https://github.com/melliforge/fitlocale';
const DESCRIPTION = 'Catch layout bugs caused by translation (truncation, overflow, untranslated text, right-to-left) in your Playwright tests.';

export default defineConfig({
  title: 'fitlocale',
  description: DESCRIPTION,
  lang: 'en',
  base: '/fitlocale/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://melliforge.github.io/fitlocale/' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/fitlocale/favicon.svg' }],
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
      // One URL per page: GitHub Pages also serves /page.html beside the clean /page.
      ['link', { rel: 'canonical', href: SITE + page.relativePath.replace(/(index)?\.md$/, '') }],
    );
  },
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Get started', link: '/guide/getting-started' },
      { text: 'Guides', link: '/guides/rtl-testing-playwright' },
      { text: 'Reference', link: '/reference/rules' },
      { text: 'Pricing', link: '/pricing' },
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
          { text: 'GitLab and other CI', link: '/reference/other-ci' },
          { text: 'Results format', link: '/reference/results' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: REPO }],
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: {
      message: 'Released under the MIT License. fitlocale cloud: <a href="https://cloud.fitlocale.dev/pricing">Pricing</a> · <a href="https://cloud.fitlocale.dev/terms">Terms</a> · <a href="https://cloud.fitlocale.dev/privacy">Privacy</a> · <a href="https://cloud.fitlocale.dev/refunds">Refunds</a>',
    },
  },
});
