import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';

// Self-reference by package name exercises the "exports" map against the built dist/.
test('entry points load with require (CommonJS)', () => {
  const require = createRequire(import.meta.url);
  const reporter = require('fitlocale/reporter');
  expect(typeof (reporter.default ?? reporter)).toBe('function');
  expect(typeof require('fitlocale/playwright').test).toBe('function');
  expect(require('fitlocale').pseudoLong('Settings')).toBe('⟦Šéttîñgš ~~~⟧');
});

test('entry points load with import (ESM)', async () => {
  expect(typeof (await import('fitlocale/playwright')).test).toBe('function');
  expect(typeof (await import('fitlocale/reporter')).default).toBe('function');
});

test('package.json is readable through the exports map', () => {
  const require = createRequire(import.meta.url);
  expect(require('fitlocale/package.json').name).toBe('fitlocale');
});

const EMPTY_RUN = { version: 1 as const, createdAt: '2026-01-01T00:00:00Z', checks: [], summary: { error: 0, warning: 0, info: 0 } };

test('fitlocale/report renders from ESM and CommonJS', async () => {
  const require = createRequire(import.meta.url);
  expect(require('fitlocale/report').renderReport(EMPTY_RUN)).toContain('<title>');
  const esm = await import('fitlocale/report');
  expect(esm.renderReport(EMPTY_RUN)).toContain('<title>');
  expect(esm.escapeHtml('<a>')).toBe('&lt;a&gt;');
});

// The hosted report renders in a Cloudflare Worker: one file, nothing from Node.
test('the report bundle uses no Node built-ins', () => {
  for (const file of ['dist/report.js', 'dist/report.cjs']) {
    const code = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    expect(code, file).not.toMatch(/(from |require\()["']node:/);
    expect(code, file).not.toMatch(/(from |require\()["']\.\.?\//);
  }
});
