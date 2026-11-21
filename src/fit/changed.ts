import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { flattenEntries, type Messages } from '../pseudo';

/**
 * Keys of a message file whose text differs from its version at `ref`, or that are new, in file order. A file that
 * did not exist at `ref` has every key changed.
 */
export function changedKeys(file: string, ref: string, cwd: string): string[] {
  const now = flattenEntries(JSON.parse(readFileSync(file, 'utf8')) as Messages);
  const path = `./${relative(cwd, file).split('\\').join('/')}`;
  let before: Map<string, string>;
  try {
    const old = execFileSync('git', ['show', `${ref}:${path}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    before = new Map(flattenEntries(JSON.parse(old) as Messages));
  } catch (err) {
    const stderr = String((err as { stderr?: Buffer }).stderr ?? (err as Error).message);
    if (/does not exist in|exists on disk, but not in/.test(stderr)) return now.map(([k]) => k);
    throw new Error(`git show ${ref}:${path} failed: ${stderr.trim().split('\n')[0]}`);
  }
  return now.filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
}
