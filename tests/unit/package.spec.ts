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
