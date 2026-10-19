// Prints the CHANGELOG.md section for one version, for use as GitHub Release notes.
// Usage: node scripts/release-notes.mjs <version|vX.Y.Z>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The body of the `## [version]` section: no heading, no link references, trimmed. */
export function releaseNotes(changelog, version) {
  const v = version.replace(/^v/, '');
  const heading = new RegExp(`^## \\[${escape(v)}\\][^\\n]*\\n`, 'm');
  const match = heading.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md has no section for ${v}`);
  const rest = changelog.slice(match.index + match[0].length);
  const end = rest.search(/^## \[|^\[[^\]]+\]:\s/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/release-notes.mjs <version>');
    process.exit(1);
  }
  process.stdout.write(releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version) + '\n');
}
