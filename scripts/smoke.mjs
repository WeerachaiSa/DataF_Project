import assert from 'node:assert/strict';
import {accounts} from './fixtures.mjs';
const base=process.env.SMOKE_URL||'http://127.0.0.1:4000';
const health=await fetch(base+'/api/v1/health');assert.equal(health.status,200);
for(const route of ['/', '/search', '/login']){const page=await fetch(base+route);assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);}
const model=await fetch(base+'/models/dataf-dormitory.glb');assert.equal(model.status,200);assert.equal(new TextDecoder().decode((await model.arrayBuffer()).slice(0,4)),'glTF');
const catalog=await (await fetch(base+'/api/v1/rooms')).json();assert.equal(catalog.rooms.length,18);
for(const a of accounts){
 const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-DataF-Request':'1'},body:JSON.stringify({email:a[0]+'@cdti.ac.th',password:a[4]})});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.user.role,a[5]);const cookie=response.headers.getSetCookie()[0].split(';')[0];
 const me=await fetch(base+'/api/v1/auth/me',{headers:{Cookie:cookie}});assert.equal(me.status,200);
 const page=await fetch(base+data.redirect);assert.equal(page.status,200);
 const logout=await fetch(base+'/api/v1/auth/logout',{method:'POST',headers:{Cookie:cookie,'X-DataF-Request':'1','Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,204);
 console.log('PASS',a[0],a[5],data.redirect);
}
console.log('Home, /search, /login, local GLB, health 200, 18 rooms, all six seeded accounts and auth destinations passed.');
