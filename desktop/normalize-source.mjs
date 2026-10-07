import '../collector/adapters.js';
import fs from 'node:fs';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const adapter=globalThis.ArcusSources;
if(input.discover) process.stdout.write(adapter.discover(input.raw,input.config.url,input.fund));
else process.stdout.write(adapter.canonical(adapter.parse(input.fund,input.config,input.raw)));
