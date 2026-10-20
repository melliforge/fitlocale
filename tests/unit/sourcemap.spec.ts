import { test, expect } from '@playwright/test';
import { transform } from 'esbuild';
import { originalPosition, parseSourceMap } from '../../src/sourcemap';

test('maps a minified declaration back to its source line', async () => {
  const css = '.badge {\n  position: absolute;\n  left: 16px;\n}\n';
  const out = await transform(css, { loader: 'css', minify: true, sourcemap: 'external', sourcefile: 'src/badge.css' });
  const map = parseSourceMap(out.map)!;
  expect(map).not.toBeNull();
  const column = out.code.indexOf('left') + 1;
  expect(originalPosition(map, 1, column)).toEqual({ source: 'src/badge.css', line: 3, column: 3 });
});

test('invalid maps never throw', () => {
  expect(parseSourceMap('{')).toBeNull();
  expect(parseSourceMap('{"version":2,"sources":[],"mappings":""}')).toBeNull();
  expect(originalPosition({ version: 3, sources: ['a.css'], mappings: '!!!' }, 1, 1)).toBeNull();
  expect(originalPosition({ version: 3, sources: ['a.css'], mappings: 'AAAA' }, 5, 1)).toBeNull();
});
