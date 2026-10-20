// Run after the Playwright tests: the reporter's output, the CLI and require() as a CommonJS project uses them.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const results = JSON.parse(readFileSync('fitlocale-report/results.json', 'utf8'));
assert.ok(results.checks.length > 0, 'results.json lists the checks');
assert.ok(existsSync('fitlocale-report/index.html'), 'the HTML report is written');

execFileSync('npx', ['fitlocale', 'baseline', 'fitlocale-report/results.json', '--out', 'fitlocale-baseline.json'], { stdio: 'inherit' });
assert.ok(JSON.parse(readFileSync('fitlocale-baseline.json', 'utf8')), 'the CLI writes a baseline');

const require = createRequire(import.meta.url);
assert.equal(typeof require('fitlocale/playwright').test, 'function', 'require() loads the CommonJS build');
console.log(`compat: ok on Node ${process.version}`);
