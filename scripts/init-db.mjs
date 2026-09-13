import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url))});
const url=new URL(process.env.DATABASE_URL);
const name=url.pathname.slice(1),user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
const identifier=s=>'"'+s.replaceAll('"','""')+'"';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
if(process.env.DATABASE_ADMIN_URL){
 const admin=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});await admin.connect();
 try {
  if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[user])).rowCount)await admin.query(`CREATE ROLE ${identifier(user)} LOGIN PASSWORD ${literal(password)}`);
  if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await admin.query(`CREATE DATABASE ${identifier(name)} OWNER ${identifier(user)}`);
 } finally {await admin.end();}
}
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
try {
 await client.query(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 const counts=await client.query('SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM rooms)::int AS rooms,(SELECT count(*) FROM leases WHERE contract_active)::int AS active_leases');
 console.log('Database initialized:',counts.rows[0]);
} finally {await client.end();}
