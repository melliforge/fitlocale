import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { pseudoMessages, type Messages } from './pseudo';
import { renderReport } from './report/html';
import type { RunResults } from './types';

export interface CliIO { stdout: (s: string) => void; stderr: (s: string) => void }

const USAGE = `Usage:
  fitlocale pseudo <input.json> [--out <file>] [--expansion <n>]   Write a pseudo-locale message file
  fitlocale report <results.json> [--out <dir>]                   Re-render index.html from results.json
  fitlocale --help
`;

const defaultIO: CliIO = { stdout: s => process.stdout.write(s), stderr: s => process.stderr.write(s) };

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}

/** Run the CLI and return its exit code. */
export async function main(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { out: { type: 'string' }, expansion: { type: 'string' }, help: { type: 'boolean' } },
    });
    const [command, input] = positionals;
    if (values.help || command === 'help') {
      io.stdout(USAGE);
      return 0;
    }
    if (command === 'pseudo' && input) {
      const expansion = values.expansion === undefined ? undefined : Number(values.expansion);
      if (expansion !== undefined && !(expansion >= 0)) throw new Error('--expansion must be a number ≥ 0');
      const json = JSON.stringify(pseudoMessages(readJson(input) as Messages, { expansion }), null, 2) + '\n';
      if (values.out) writeFileSync(values.out, json);
      else io.stdout(json);
      return 0;
    }
    if (command === 'report' && input) {
      const dir = values.out ?? dirname(input);
      writeFileSync(join(dir, 'index.html'), renderReport(readJson(input) as RunResults));
      io.stdout(`fitlocale: wrote ${join(dir, 'index.html')}\n`);
      return 0;
    }
    io.stderr(`${command ? `Unknown command or missing file: ${command}` : 'Unknown command'}\n\n${USAGE}`);
    return 1;
  } catch (err) {
    io.stderr(`fitlocale: ${(err as Error).message}\n`);
    return 1;
  }
}
