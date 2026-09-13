import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {accounts} from '../../scripts/fixtures.mjs';
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url))});
const testDb='dataf_test_'+process.pid+'_'+Date.now();
let admin,dbPool,server,base;
const sessions=[];
async function request(path,{method='GET',body,cookie,headers={}}={}){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-DataF-Request':'1',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const data=response.status===204?null:await response.json();return {status:response.status,data,cookie:response.headers.getSetCookie()[0]?.split(';')[0],headers:response.headers};
}
before(async()=>{
 if(!process.env.DATABASE_ADMIN_URL)throw new Error('Integration tests require DATABASE_ADMIN_URL to create an isolated disposable database.');
 admin=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});await admin.connect();
 const appUrl=new URL(process.env.DATABASE_URL),appUser=decodeURIComponent(appUrl.username);
 await admin.query(`CREATE DATABASE "${testDb}" OWNER "${appUser.replaceAll('"','""')}"`);
 appUrl.pathname='/'+testDb;process.env.DATABASE_URL=appUrl.toString();
 const {pool}=await import('../src/db.js');dbPool=pool;
 await dbPool.query(await readFile(new URL('../../seed.sql',import.meta.url),'utf8'));
 const {app}=await import('../src/app.js');server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async()=>{
 if(server){await new Promise(resolve=>server.close(resolve));}
 if(dbPool)await dbPool.end();
 if(admin){await admin.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);await admin.end();}
});
test('database, 18 images, public filters, privacy and repeatable seed',async()=>{
 assert.equal((await request('/health')).status,200);
 const catalog=await request('/rooms');assert.equal(catalog.data.rooms.length,18);assert.deepEqual(catalog.data.stats,{total:18,available:13,occupied:5});
 assert.equal(catalog.data.rooms.filter(r=>r.bed_type==='SINGLE').length,9);
 assert.ok(!JSON.stringify(catalog.data).includes('resident_id'));assert.ok(!JSON.stringify(catalog.data).includes('phone_number'));
 for(const room of catalog.data.rooms){const asset=await fetch(base.replace('/api/v1','')+encodeURI(room.image_url));assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/image\/png/);const bytes=new Uint8Array(await asset.arrayBuffer());assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);}
 assert.equal((await request('/rooms?floor=3&bed_type=SINGLE&status=VACANT')).data.rooms.length,2);
 assert.equal((await request('/rooms?floor=4')).status,400);
 assert.equal((await request('/rooms?floor=1%20OR%201=1')).status,400);
 assert.equal((await request('/rooms/9999')).status,404);
 await dbPool.query(await readFile(new URL('../../seed.sql',import.meta.url),'utf8'));
 assert.equal((await dbPool.query('SELECT count(*)::int AS n FROM invoices')).rows[0].n,5);
 const roles=await dbPool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');assert.equal(roles.rows[0].rolsuper,false);
});
test('billing migration retains invoice history and removes the legacy charge',async()=>{
 const before=(await dbPool.query('SELECT id,invoice_number,status,resident_id,paid_at,total_amount FROM invoices ORDER BY id')).rows;
 await dbPool.query(`BEGIN;
  ALTER TABLE invoices DROP COLUMN total_amount;
  ALTER TABLE invoices ADD COLUMN common_fee numeric(10,2) NOT NULL DEFAULT 300;
  ALTER TABLE utility_rates ADD COLUMN common_fee numeric(8,2) NOT NULL DEFAULT 300;
  ALTER TABLE invoices ADD COLUMN total_amount numeric(10,2) GENERATED ALWAYS AS (rent_amount+water_amount+electric_amount+common_fee) STORED;
  COMMIT;`);
 await dbPool.query('BEGIN');
 try{await dbPool.query(await readFile(new URL('../../database/migrations/20260907_remove_common_fee.sql',import.meta.url),'utf8'));await dbPool.query('COMMIT');}
 catch(error){await dbPool.query('ROLLBACK');throw error;}
 const after=(await dbPool.query('SELECT id,invoice_number,status,resident_id,paid_at,total_amount FROM invoices ORDER BY id')).rows;
 assert.deepEqual(after,before);
 assert.equal((await dbPool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('invoices','utility_rates') AND column_name='common_fee'")).rowCount,0);
 assert.equal((await dbPool.query('SELECT sum(total_amount)::text AS total FROM invoices')).rows[0].total,'20920.00');
});

test('all six seeded users: login, me, role destination, refresh rotation, logout revocation',async()=>{
 const expectedRooms=[null,'002','005','008','011','014'];
 for(let n=0;n<accounts.length;n++){
  const a=accounts[n],login=await request('/auth/login',{method:'POST',body:{email:a[0]+'@cdti.ac.th',password:a[4]}});
  assert.equal(login.status,200);assert.equal(login.data.user.role,a[5]);assert.equal(login.data.redirect,n===0?'/admin':'/resident');
  assert.ok(!JSON.stringify(login.data).includes('password'));assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Lax/);
  const me=await request('/auth/me',{cookie:login.cookie});assert.equal(me.status,200);assert.equal(me.data.room?.room_number||null,expectedRooms[n]);
  const refresh=await request('/auth/refresh',{method:'POST',body:{},cookie:login.cookie});assert.equal(refresh.status,200);assert.notEqual(refresh.cookie,login.cookie);
  assert.equal((await request('/auth/me',{cookie:login.cookie})).status,401);
  assert.equal((await request('/auth/logout',{method:'POST',body:{},cookie:refresh.cookie})).status,204);
  assert.equal((await request('/auth/me',{cookie:refresh.cookie})).status,401);
  const again=await request('/auth/login',{method:'POST',body:{email:a[0]+'@cdti.ac.th',password:a[4]}});sessions[n]=again.cookie;
 }
});
test('auth rejects invalid credentials, forged cookies, anonymous requests and CSRF',async()=>{
 assert.equal((await request('/auth/login',{method:'POST',body:{email:accounts[0][0]+'@cdti.ac.th',password:'wrong'}})).status,401);
 assert.equal((await request('/auth/login',{method:'POST',body:{email:'missing@cdti.ac.th',password:'wrong'}})).status,401);
 for(const path of ['/auth/me','/invoices','/maintenance','/staff','/regulations','/admin/overview','/admin/rooms','/admin/residents','/meter-readings','/utility-rates'])assert.equal((await request(path)).status,401,path);
 for(const path of ['/auth/refresh','/auth/logout'])assert.equal((await request(path,{method:'POST',body:{}})).status,401,path);
 assert.equal((await request('/auth/me',{cookie:'dataf_session=fake.jwt.token'})).status,401);
 assert.equal((await request('/auth/refresh',{method:'POST',body:{},cookie:sessions[1],headers:{Origin:'https://attacker.example'}})).status,403);
 assert.equal((await request('/auth/login',{method:'POST',body:{email:accounts[0][0]+'@cdti.ac.th',password:accounts[0][4]},headers:{'X-DataF-Request':''}})).status,403);
});
test('RBAC and tenant isolation protect every private resource',async()=>{
 for(const path of ['/admin/overview','/admin/rooms','/admin/residents','/meter-readings'])assert.equal((await request(path,{cookie:sessions[1]})).status,403,path);
 const mine=await request('/invoices',{cookie:sessions[1]}),theirs=await request('/invoices',{cookie:sessions[2]});assert.equal(mine.data.invoices.length,1);assert.equal(mine.data.invoices[0].room_number,'002');
 assert.equal((await request('/invoices/'+theirs.data.invoices[0].id,{cookie:sessions[1]})).status,404);
 assert.equal((await request('/invoices/'+theirs.data.invoices[0].id+'/payment-notification',{method:'POST',body:{},cookie:sessions[1]})).status,404);
 for(const [path,method,body] of [['/rooms/1/status','PATCH',{status:'MAINTENANCE'}],['/rooms/1/lease','POST',{}],['/leases/00000000-0000-4000-8000-000000000000/end','POST',{}],['/maintenance/1','PATCH',{status:'RESOLVED'}],['/meter-readings','POST',{}],['/invoices/generate','POST',{}],['/invoices/'+mine.data.invoices[0].id+'/payment-review','POST',{decision:'APPROVED'}]])assert.equal((await request(path,{method,body,cookie:sessions[1]})).status,403,path);
 assert.equal((await request('/staff',{cookie:sessions[1]})).data.staff.length,5);
 assert.equal((await request('/regulations',{cookie:sessions[1]})).data.regulations.length,5);
});
test('manual payment requires admin review; duplicate notifications and re-approval are rejected',async()=>{
 const invoice=(await request('/invoices',{cookie:sessions[1]})).data.invoices[0],path='/invoices/'+invoice.id;
 assert.equal(Number(invoice.total_amount),3588);
 assert.equal((await request(path+'/payment-review',{method:'POST',body:{decision:'APPROVED'},cookie:sessions[0]})).status,409);
 assert.equal((await request(path+'/payment-notification',{method:'POST',body:{note:'Paid in person, test'},cookie:sessions[1]})).status,201);
 assert.notEqual((await request(path,{cookie:sessions[1]})).data.invoice.status,'PAID');
 assert.equal((await request(path+'/payment-notification',{method:'POST',body:{},cookie:sessions[1]})).status,409);
 assert.equal((await request(path+'/payment-review',{method:'POST',body:{decision:'REJECTED'},cookie:sessions[0]})).status,200);
 assert.equal((await request(path+'/payment-notification',{method:'POST',body:{},cookie:sessions[1]})).status,201);
 assert.equal((await request(path+'/payment-review',{method:'POST',body:{decision:'APPROVED'},cookie:sessions[0]})).status,200);
 const paid=(await request(path,{cookie:sessions[1]})).data.invoice;assert.equal(paid.status,'PAID');assert.ok(paid.paid_at);
 assert.equal((await request(path+'/payment-review',{method:'POST',body:{decision:'APPROVED'},cookie:sessions[0]})).status,409);
});
test('maintenance is text-only, derives room from lease, is isolated, and tracks admin status',async()=>{
 const body={category:'AC',description:'เครื่องปรับอากาศไม่เย็นตั้งแต่เช้า'};
 assert.equal((await request('/maintenance',{method:'POST',body:{...body,room_id:5},cookie:sessions[1]})).status,400);
 assert.equal((await request('/maintenance',{method:'POST',body:{...body,image:'base64'},cookie:sessions[1]})).status,400);
 const created=await request('/maintenance',{method:'POST',body,cookie:sessions[1]});assert.equal(created.status,201);assert.equal(created.data.request.room_id,2);
 assert.equal((await request('/maintenance',{cookie:sessions[2]})).data.requests.length,0);
 assert.equal((await request('/maintenance/'+created.data.request.id,{method:'PATCH',body:{status:'IN_PROGRESS'},cookie:sessions[0]})).status,200);
 assert.equal((await request('/maintenance',{cookie:sessions[1]})).data.requests[0].status,'IN_PROGRESS');
});
test('meter continuity, SQL numeric invoice formula, historical rates and duplicate billing protection',async()=>{
 const body={room_id:2,billing_month:'2026-10-01',prev_water_unit:106,curr_water_unit:110.5,prev_electric_unit:560,curr_electric_unit:625.25};
 assert.equal((await request('/meter-readings',{method:'POST',body:{...body,curr_water_unit:1},cookie:sessions[0]})).status,400);
 assert.equal((await request('/meter-readings',{method:'POST',body:{...body,prev_water_unit:0},cookie:sessions[0]})).status,409);
 assert.equal((await request('/meter-readings',{method:'POST',body,cookie:sessions[0]})).status,201);
 assert.equal((await request('/meter-readings',{method:'POST',body,cookie:sessions[0]})).status,409);
 const bill=await request('/invoices/generate',{method:'POST',body:{room_id:2,billing_cycle:'2026-10-01'},cookie:sessions[0]});assert.equal(bill.status,201);assert.equal(Number(bill.data.invoice.total_amount),3603);assert.equal(bill.data.invoice.due_date,'2026-10-05');
 assert.equal((await request('/invoices/generate',{method:'POST',body:{room_id:2,billing_cycle:'2026-10-01'},cookie:sessions[0]})).status,409);
 assert.equal((await request('/invoices/generate',{method:'POST',body:{room_id:2,billing_cycle:'2026-11-01'},cookie:sessions[0]})).status,409);
});
test('room allocations enforce one lease per resident/room and preserve history on checkout',async()=>{
 let rooms=(await request('/admin/rooms',{cookie:sessions[0]})).data.rooms;
 const old=rooms.find(r=>r.id===14),body={resident_id:old.current_resident_id,start_date:'2026-09-07',end_date:'2027-07-31',deposit_paid:3000};
 assert.equal((await request('/rooms/13/lease',{method:'POST',body,cookie:sessions[0]})).status,409);
 assert.equal((await request('/rooms/14/status',{method:'PATCH',body:{status:'MAINTENANCE'},cookie:sessions[0]})).status,409);
 assert.equal((await request('/leases/'+old.lease_id+'/end',{method:'POST',body:{},cookie:sessions[0]})).status,200);
 assert.equal((await request('/rooms/13/status',{method:'PATCH',body:{status:'MAINTENANCE'},cookie:sessions[0]})).status,200);
 assert.equal((await request('/rooms/13/lease',{method:'POST',body,cookie:sessions[0]})).status,409);
 await request('/rooms/13/status',{method:'PATCH',body:{status:'VACANT'},cookie:sessions[0]});
 assert.equal((await request('/rooms/13/lease',{method:'POST',body,cookie:sessions[0]})).status,201);
 assert.equal((await request('/auth/me',{cookie:sessions[5]})).data.room.room_number,'013');
 assert.equal((await request('/invoices',{cookie:sessions[5]})).data.invoices[0].room_number,'014');
 assert.equal((await request('/admin/overview',{cookie:sessions[0]})).data.rooms.occupied,5);
 assert.ok((await dbPool.query('SELECT count(*)::int AS n FROM audit_events')).rows[0].n>=15);
});

