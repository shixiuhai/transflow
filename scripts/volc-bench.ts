import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createVolcProvider } from '../src/core/provider/adapters/volc';

const env = Object.fromEntries(
  readFileSync(process.env.VOLC_ENV ?? join(homedir(), '.secrets', 'volc.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const provider = createVolcProvider({ accessKey: env.VOLC_AK, secretKey: env.VOLC_SK });
const times: number[] = [];

for (let i = 0; i < 5; i++) {
  const started = performance.now();
  await provider.translate({ segments: [{ id: 's', text: 'The quick brown fox jumps over the lazy dog.' }], from: 'en', to: 'zh' });
  times.push(Math.round(performance.now() - started));
}

const batch = Array.from({ length: 16 }, (_, i) => ({
  id: String(i),
  text: `Paragraph ${i + 1}. Interfaces should disappear while you read and return only when you need them.`,
}));
const batchTimes: number[] = [];
for (let i = 0; i < 3; i++) {
  const started = performance.now();
  await provider.translate({ segments: batch, from: 'en', to: 'zh' });
  batchTimes.push(Math.round(performance.now() - started));
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const median = (values: number[]) => sorted(values)[Math.floor(values.length / 2)];
console.log('single (ms):', times.join(', '), '| median', median(times));
console.log('batch16 (ms):', batchTimes.join(', '), '| median', median(batchTimes));
