import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

// What `npm publish` would upload, without uploading anything.
function packedFiles(): string[] {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
  return (JSON.parse(out) as Array<{ files: Array<{ path: string }> }>)[0].files.map(f => f.path);
}

test('the npm package ships docs and builds, and nothing else', () => {
  const files = packedFiles();
  for (const required of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'dist/index.js', 'dist/index.cjs', 'dist/cli.js']) {
    expect(files, required).toContain(required);
  }
  expect(files.filter(f => !/^(dist\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/.test(f))).toEqual([]);
});
