#!/usr/bin/env node
 
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://overchat.ai/image/ghibli';

export async function key(url = DEFAULT_URL) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) NodeScraper/1.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.7',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();

  const keysSet = new Set();
  const skRegex = /sk-[A-Za-z0-9_\-]{20,}/g;
  for (const m of html.matchAll(skRegex)) keysSet.add(m[0]);

  const varAssignRegex = /(?:const|let|var)\s+(?:apiKey|openaiKey|openaiApiKey|OPENAI_API_KEY)\s*=\s*['"]([^'"\n\r]+)['"];?/g;
  for (const m of html.matchAll(varAssignRegex)) if (m[1]) keysSet.add(m[1]);

  const envRegex = /OPENAI_API_KEY\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/g;
  for (const m of html.matchAll(envRegex)) if (m[1]) keysSet.add(m[1]);

  const keys = Array.from(keysSet);
  if (keys.length === 0) throw new Error('No OpenAI-style key found.');
  return keys[Math.floor(Math.random() * keys.length)];
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const url = process.argv[2] || DEFAULT_URL;
  key(url)
    .then((k) => process.stdout.write(k + '\n'))
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
