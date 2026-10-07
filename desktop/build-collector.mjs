// Paste the generated file into Apps Script. Configuration and adapters remain separate maintained files.
import fs from 'node:fs';
const funds=JSON.parse(fs.readFileSync(new URL('../config/funds.json',import.meta.url)));
const config=Object.fromEntries(Object.entries(funds).filter(([,c])=>c.provider!=='portfolio'&&!c.manualOnly).map(([id,c])=>[id,{...c,kind:c.provider}]));
const source=fs.readFileSync(new URL('../collector/Code.gs',import.meta.url),'utf8').replace(/const FUNDS = \{[\s\S]*?\n\};/, 'const FUNDS = '+JSON.stringify(config,null,2)+';');
const adapters=fs.readFileSync(new URL('../collector/adapters.js',import.meta.url),'utf8');
fs.mkdirSync(new URL('../private/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../private/Google-Collector.gs',import.meta.url),adapters+'\n'+source);
console.log('Built private/Google-Collector.gs with '+Object.keys(config).length+' funds');
