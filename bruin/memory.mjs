// Game memory API over the Bruin marts. Node only (shells out to the bruin CLI).
//   import { refreshMemory, ask } from '../bruin/memory.mjs'
//   await refreshMemory()                                   // bash bruin/run.sh; false when a check failed
//   await ask('counter_pick', { player: 'p1', situation: 'opening' })
//     -> [{ expect: 'strike', share: 0.54, counter: 'block', cite: 'habits:p1/opening/strike' }]
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SAFE = /^[a-z0-9_]+$/; // ids go into SQL via Jinja, so only plain ids pass

export async function refreshMemory() {
  try {
    await run('bash', [join(HERE, 'run.sh'), '--no-color'], { maxBuffer: 1 << 24 });
    return true;
  } catch {
    return false; // a failed check blocked the marts; the last good marts stay readable
  }
}

export async function ask(name, vars = {}) {
  if (!SAFE.test(name)) throw new Error(`bad query name ${name}`);
  const args = ['query', '--config-file', join(HERE, '.bruin.yml'), '-c', 'duckdb-default', '-o', 'json',
    '-q', readFileSync(join(HERE, 'queries', `${name}.sql`), 'utf8')];
  for (const [k, v] of Object.entries(vars)) {
    if (!SAFE.test(k) || !SAFE.test(String(v))) throw new Error(`bad var ${k}=${v}`);
    args.push('--var', `${k}=${v}`);
  }
  const { stdout } = await run('bruin', args, { cwd: HERE, maxBuffer: 1 << 24 });
  const { columns, rows } = JSON.parse(stdout);
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i]])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, ...kv] = process.argv.slice(2);
  console.log(JSON.stringify(await ask(name, Object.fromEntries(kv.map((s) => s.split('=')))), null, 1));
}
