import {chromium,expect} from '@playwright/test';
import dotenv from 'dotenv';
import pg from 'pg';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {accounts} from './fixtures.mjs';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url))});
const dbName='dataf_browser_'+process.pid+'_'+Date.now();
const admin=new pg.Client({connectionString:process.env.DATABASE_ADMIN_URL});
let pool,server,browser;const results=[],pageErrors=[];
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
const artifact=name=>fileURLToPath(new URL('../test-results/'+name,import.meta.url));
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
try{
 await admin.connect();const appUrl=new URL(process.env.DATABASE_URL),user=decodeURIComponent(appUrl.username);
 await admin.query(`CREATE DATABASE "${dbName}" OWNER "${user.replaceAll('"','""')}"`);appUrl.pathname='/'+dbName;process.env.DATABASE_URL=appUrl.toString();
 ({pool}=await import('../server/src/db.js'));await pool.query(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 const {app}=await import('../server/src/app.js');server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
 const login=async(a)=>{await page.goto(base+'/login');await page.getByLabel('อีเมลมหาวิทยาลัย').fill(a[0]+'@cdti.ac.th');await page.getByLabel('รหัสผ่าน',{exact:true}).fill(a[4]);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await expect(page).toHaveURL(base+(a[5]==='SUPER_ADMIN'?'/admin':'/resident'));};
 await check('public catalog renders all 18 rooms, filters, details and real images',async()=>{
  await page.goto(base+'/search');await expect(page.locator('.room-card')).toHaveCount(18);await page.locator('.room-card img').first().evaluate(img=>img.decode());await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:artifact('catalog-desktop.png')});
  await page.getByRole('button',{name:'ชั้น 3',exact:true}).click();await expect(page.locator('.room-card')).toHaveCount(6);
  await page.getByLabel('แสดงเฉพาะห้องว่าง').check();await expect(page.locator('.room-card')).toHaveCount(5);
  await page.getByRole('button',{name:'ล้างค่า',exact:true}).click();await page.getByRole('button',{name:'ดูรายละเอียดห้อง 001',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'ปิด',exact:true}).click();
 });
 await check('invalid login is visible and protected routes redirect to login',async()=>{
  await page.goto(base+'/admin');await expect(page).toHaveURL(base+'/login');await page.getByLabel('อีเมลมหาวิทยาลัย').fill(accounts[0][0]+'@cdti.ac.th');await page.getByLabel('รหัสผ่าน',{exact:true}).fill('incorrect');await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await expect(page.getByRole('alert')).toContainText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');await page.screenshot({path:artifact('login.png')});
 });
 for(const a of accounts)await check('seeded UI login and route protection: '+a[0],async()=>{
  await login(a);
  if(a[5]==='SUPER_ADMIN'){await expect(page.getByRole('heading',{name:'ภาพรวม',exact:true})).toBeVisible();await page.screenshot({path:artifact('admin-desktop.png')});await page.goto(base+'/resident');await expect(page).toHaveURL(base+'/admin');}
  else{await expect(page.getByRole('tab')).toHaveCount(4);await page.goto(base+'/admin');await expect(page).toHaveURL(base+'/resident');await expect(page.getByText('ใบแจ้งค่าใช้จ่าย',{exact:true})).toBeVisible();if(a===accounts[1])await page.screenshot({path:artifact('resident-desktop.png')});}
  await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await expect(page).toHaveURL(base+'/');await page.waitForLoadState('load');await expect(page.locator('#home-heading')).toBeVisible();await expect(page).toHaveURL(base+'/');await page.goto(base+'/resident');await expect(page).toHaveURL(base+'/login');
 });
 await check('resident payment notice, repair form, staff and five regulations work',async()=>{
  await login(accounts[1]);await expect(page.locator('.invoice-line')).toHaveCount(3);await expect(page.locator('.invoice-total')).toContainText('3,588');await expect(page.locator('.invoice-panel')).not.toContainText('ส่วนกลาง');await page.getByRole('button',{name:'คลิกเพื่อแจ้งชำระเงิน (Manual)',exact:true}).click();await page.getByLabel('ข้อความถึงผู้ดูแล (ไม่บังคับ)').fill('Browser test payment');await page.getByRole('button',{name:'ยืนยันการแจ้งชำระเงิน',exact:true}).click();await expect(page.getByRole('button',{name:'แจ้งแล้ว · รอผู้ดูแลตรวจสอบ'})).toBeDisabled();
  await page.getByRole('tab',{name:/บริการแจ้งซ่อม/}).click();await page.getByLabel('รายละเอียดปัญหา').fill('เครื่องปรับอากาศมีน้ำหยดบริเวณโต๊ะอ่านหนังสือ');await page.getByRole('button',{name:'ส่งเรื่องแจ้งซ่อม',exact:true}).click();await expect(page.locator('.ticket')).toHaveCount(1);
  await page.getByRole('tab',{name:/บริการติดต่อผู้ดูแลหอพัก/}).click();await expect(page.locator('.staff-card')).toHaveCount(5);await expect(page.locator('a[href^="tel:"]')).toHaveCount(5);
  await page.getByRole('tab',{name:/บริการข้อมูลกฎระเบียบหอพัก/}).click();await expect(page.locator('.regulation-list article')).toHaveCount(5);await expect(page.locator('.regulation-list')).toContainText('22:00');
  await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await expect(page).toHaveURL(base+'/');await page.waitForLoadState('load');await expect(page.locator('#home-heading')).toBeVisible();
 });
 await check('admin confirms payment, updates repair and issues calculated bill through forms',async()=>{
  await login(accounts[0]);await page.getByRole('button',{name:'ใบแจ้งหนี้และการชำระ',exact:true}).click();await page.getByRole('row').filter({hasText:'DF-202609-002'}).getByRole('button',{name:/รายละเอียด/}).click();await page.getByRole('button',{name:'ยืนยันรับชำระ',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'DF-202609-002'})).toContainText('ชำระแล้ว');
  await page.getByRole('button',{name:/รายการแจ้งซ่อม/}).click();await page.locator('.admin-ticket select').selectOption('RESOLVED');await expect(page.locator('.notice.success')).toContainText('อัปเดตสถานะงานซ่อมแล้ว');
  await page.getByRole('button',{name:'บันทึกมิเตอร์',exact:true}).click();await page.getByLabel('มิเตอร์น้ำปัจจุบัน').fill('112');await page.getByLabel('มิเตอร์ไฟปัจจุบัน').fill('630');await page.getByRole('button',{name:'บันทึกมิเตอร์',exact:true}).last().click();await expect(page.locator('.notice.success')).toContainText('บันทึกมิเตอร์แล้ว');await page.getByRole('button',{name:'ออกใบแจ้งหนี้',exact:true}).click();await expect(page.locator('.notice.success')).toContainText('ออกใบแจ้งหนี้เรียบร้อยแล้ว');
  await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await expect(page).toHaveURL(base+'/');await page.waitForLoadState('load');await expect(page.locator('#home-heading')).toBeVisible();
 });
 await check('authenticated mock announcements, search, details and local images work',async()=>{
  await login(accounts[1]);await expect(page.getByRole('link',{name:'ค้นหาห้องพัก',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'ประชาสัมพันธ์',exact:true}).click();await expect(page).toHaveURL(base+'/announcements');
  await expect(page.locator('.news-feature')).toHaveCount(1);await expect(page.locator('.news-side-list article')).toHaveCount(5);
  await page.locator('.news-feature-layout img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('main')).not.toContainText('TCAS');await expect(page.locator('main')).toContainText('ตัวอย่าง');
  await page.screenshot({path:artifact('announcements-desktop.png'),fullPage:true});
  await mkdir(new URL('../test-results/manual/',import.meta.url),{recursive:true});await page.screenshot({path:artifact('manual/announcements.png'),fullPage:true});
  await page.getByLabel('ค้นหาข่าวประชาสัมพันธ์').fill('แยกขยะ');await page.getByRole('button',{name:'ค้นหาข่าว',exact:true}).click();await expect(page.locator('.news-all-grid article')).toHaveCount(1);
  await page.locator('.news-grid-link').click();await expect(page).toHaveURL(base+'/announcements/green-dorm');await expect(page.locator('.news-article')).toBeVisible();
  await page.goto(base+'/announcements?view=all');await expect(page.locator('.news-all-grid article')).toHaveCount(6);
  await page.goto(base+'/');await expect(page.locator('#home-heading')).toBeVisible();await expect(page).toHaveURL(base+'/');
  await page.goto(base+'/search');await expect(page).toHaveURL(base+'/announcements');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:artifact('announcements-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1050});await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await expect(page).toHaveURL(base+'/');
  await page.goto(base+'/announcements');await expect(page).toHaveURL(base+'/login');
 });
 await check('mobile catalog and resident services fit a 390px viewport',async()=>{
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/search');await expect(page.locator('.room-card')).toHaveCount(18);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:artifact('catalog-mobile.png'),fullPage:true});
  await login(accounts[1]);await expect(page.getByRole('tab')).toHaveCount(4);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:artifact('resident-mobile.png'),fullPage:true});
 });
 assert.deepEqual(pageErrors,[]);console.log('No browser JavaScript errors.');
 await writeFile(artifact('browser-results.json'),JSON.stringify({results,pageErrors},null,2));
}finally{
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();
 await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);await admin.end();
}
