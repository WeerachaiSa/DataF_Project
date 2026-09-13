import dotenv from 'dotenv';
import pg from 'pg';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
dotenv.config({path:path.join(root,'.env')});
const url=new URL(process.env.DATABASE_URL);
const client=new pg.Client({connectionString:url.toString()});
await client.connect();
try {
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await client.query('LOCK TABLE invoices, utility_rates IN SHARE ROW EXCLUSIVE MODE');
 const columns=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('invoices','utility_rates') AND column_name='common_fee'")).rows;
 if(!columns.length){await client.query('ROLLBACK');console.log('Already migrated: no legacy fee columns.');}
 else {
  const before=(await client.query('SELECT count(*)::int AS invoices, sum(total_amount)::text AS total FROM invoices')).rows[0];
  const snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const backupDir=path.join(root,'.local','backups');await mkdir(backupDir,{recursive:true});
  const stamp=new Date().toISOString().replaceAll(':','-');
  const backupPath=path.join(backupDir,'before-billing-update-'+stamp+'.dump');
  const executable=process.env.PG_DUMP_PATH||path.join(root,'.local','postgresql16','pgsql','bin','pg_dump.exe');
  await new Promise((resolve,reject)=>{
   const child=spawn(executable,['--format=custom','--snapshot='+snapshot,'--file='+backupPath],{windowsHide:true,env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:url.pathname.slice(1),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)},stdio:['ignore','ignore','pipe']});
   let error='';child.stderr.on('data',data=>error+=data);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Backup failed: '+error)));
  });
  await client.query(await readFile(new URL('../database/migrations/20260907_remove_common_fee.sql',import.meta.url),'utf8'));
  const after=(await client.query('SELECT count(*)::int AS invoices,sum(total_amount)::text AS total FROM invoices')).rows[0];
  if(before.invoices!==after.invoices)throw new Error('Invoice count changed unexpectedly');
  await client.query('COMMIT');
  const report={backupPath,before,after,migratedAt:new Date().toISOString(),note:'Existing invoice identities, status and payment records retained; totals recalculated from rent, water and electricity.'};
  await writeFile(path.join(backupDir,'billing-update-'+stamp+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }
} catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
