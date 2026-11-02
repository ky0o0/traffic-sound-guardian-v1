// Execute the genuine V1.6.15 rule; never substitute generic bells for bicycle truth.
import fs from 'node:fs';
import { chooseTarget } from '../../detection.js';
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
process.stdout.write(JSON.stringify(data.rows.map(row=>{
  const scores=Object.fromEntries(data.names.map((name,i)=>[name,row[i]]));
  return chooseTarget(scores)?.name ?? null;
})));
