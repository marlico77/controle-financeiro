// Run current regression tests; historical findings remain in verification-results.json.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'test')).filter(name=>name.endsWith('.test.cjs')).map(name=>path.join(root,'test',name));
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error) {console.error(result.error.message);process.exitCode=1;}
else process.exitCode=result.status ?? 1;
