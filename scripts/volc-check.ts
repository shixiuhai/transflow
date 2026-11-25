/**
 * Real-provider check for Volcengine. Reads AK/SK from ~/.secrets/volc.env
 * (or VOLC_ENV) and runs a test + two sample translations.
 *
 *   pnpm volc:check
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createVolcProvider } from '../src/core/provider/adapters/volc';

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

const envPath = process.env.VOLC_ENV ?? join(homedir(), '.secrets', 'volc.env');
const env = { ...loadEnv(envPath), ...process.env };
const accessKey = env.VOLC_AK ?? '';
const secretKey = env.VOLC_SK ?? '';

if (!accessKey || !secretKey) {
  console.error(`未找到火山 AK/SK。请写入 ${envPath}：`);
  console.error('  VOLC_AK=...');
  console.error('  VOLC_SK=...');
  process.exit(2);
}

const provider = createVolcProvider({ accessKey, secretKey });

const test = await provider.test();
console.log('test:', test);

if (!test.ok) process.exit(1);

const results = await provider.translate({
  segments: [
    { id: '1', text: 'The quick brown fox jumps over the lazy dog.' },
    { id: '2', text: 'TransFlow keeps the original and the translation side by side.' },
  ],
  from: 'en',
  to: 'zh',
});

for (const result of results) console.log(`${result.id}: ${result.text}`);
