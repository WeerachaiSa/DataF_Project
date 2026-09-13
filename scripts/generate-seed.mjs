import { readFile, writeFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { accounts, assignments, rules } from './fixtures.mjs';
const q = v => `'${String(v).replaceAll("'", "''")}'`;
let sql = '-- DataF demo seed; PostgreSQL 16. Safe to rerun: existing records are preserved.\nBEGIN;\n';
sql += await readFile(new URL('../database/schema.sql', import.meta.url),'utf8');
for(const a of accounts) {
 const hash = await bcrypt.hash(a[4],12);
 sql += `\nINSERT INTO users(student_id,full_name_th,full_name_en,phone_number,email,password_hash,role) VALUES (${[a[0],a[1],a[2],a[3],a[0]+'@cdti.ac.th',hash,a[5]].map(q).join(',')}) ON CONFLICT DO NOTHING;`;
}
sql += `\nINSERT INTO room_types(id,name,bed_type,base_rent,deposit_amount,advance_payment,area_sqm,description,amenities) VALUES
 (1,'เตียงเดี่ยว','SINGLE',3000,3000,3000,24,'พื้นที่ส่วนตัวสำหรับการเรียนและพักผ่อน พร้อมเฟอร์นิเจอร์และห้องน้ำในตัว','["Wi-Fi","เครื่องปรับอากาศ","ห้องน้ำในตัว","โต๊ะอ่านหนังสือ"]'),
 (2,'เตียงคู่','TWIN',4000,4000,4000,32,'ห้องกว้างพร้อมเตียงแยกสองเตียง ตู้เสื้อผ้า และมุมอ่านหนังสือ','["Wi-Fi","เครื่องปรับอากาศ","ห้องน้ำในตัว","โต๊ะอ่านหนังสือ"]') ON CONFLICT DO NOTHING;`;
let roomCsv = 'หมายเลขห้อง,ประเภทห้องพัก,ชั้น,สถานะห้องพัก,ค่าเช่า (บาท),รหัสนักศึกษา\n';
for(let n=1;n<=18;n++) {
 const room=String(n).padStart(3,'0'),floor=Math.ceil(n/6),type=(n-1)%6<3?1:2,thai=type===1?'เตียงเดี่ยว':'เตียงคู่';
 sql += `\nINSERT INTO rooms(id,room_number,floor,room_type_id,rent_rate) VALUES (${n},${q(room)},${floor},${type},${type===1?3000:4000}) ON CONFLICT DO NOTHING;`;
 sql += `\nINSERT INTO room_images(room_id,asset_path,alt_text) VALUES (${n},${q('/room-images/ชั้น'+floor+'/'+thai+'/'+thai+'_'+room+'.png')},${q('ภาพประกอบห้อง '+room+' '+thai)}) ON CONFLICT DO NOTHING;`;
 if(assignments[n]) sql += `\nINSERT INTO leases(room_id,resident_id,start_date,end_date,deposit_paid) SELECT ${n},id,'2026-08-01','2027-07-31',${type===1?3000:4000} FROM users WHERE student_id=${q(accounts[assignments[n]][0])} AND NOT EXISTS(SELECT 1 FROM leases WHERE room_id=${n}) AND NOT EXISTS(SELECT 1 FROM leases l WHERE l.resident_id=users.id) ON CONFLICT DO NOTHING;`;
 roomCsv += `${room},${thai},${floor},${assignments[n]?'มีผู้เช่า':'ว่าง'},${type===1?3000:4000},${assignments[n]?accounts[assignments[n]][0]:''}\n`;
}
sql += `\nINSERT INTO utility_rates(effective_date,water_rate_per_unit,electric_rate_per_unit) VALUES ('2026-08-01',18,8) ON CONFLICT DO NOTHING;`;
for(const [n,a] of Object.entries(assignments)) {
 sql += `\nINSERT INTO meter_readings(room_id,billing_month,prev_water_unit,curr_water_unit,prev_electric_unit,curr_electric_unit) VALUES (${n},'2026-09-01',100,${105+Number(a)},500,${550+Number(a)*10}) ON CONFLICT DO NOTHING;`;
 sql += `\nINSERT INTO invoices(invoice_number,room_id,resident_id,meter_reading_id,utility_rate_id,billing_cycle,rent_amount,water_amount,electric_amount,due_date)
 SELECT 'DF-202609-'||r.room_number,r.id,u.id,m.id,ur.id,'2026-09-01',r.rent_rate,(m.curr_water_unit-m.prev_water_unit)*ur.water_rate_per_unit,(m.curr_electric_unit-m.prev_electric_unit)*ur.electric_rate_per_unit,'2026-09-05'
 FROM rooms r JOIN users u ON u.student_id=${q(accounts[a][0])} JOIN meter_readings m ON m.room_id=r.id AND m.billing_month='2026-09-01' JOIN utility_rates ur ON ur.effective_date='2026-08-01' WHERE r.id=${n} ON CONFLICT DO NOTHING;`;
}
for(const staff of [['สมชาย ใจดี','MANAGER','จันทร์ – เสาร์ 08:00 – 17:00','0811112233',false],['สมศรี สะอาด','MAID','ทุกวัน 07:00 – 16:00','0822223344',false],['มานะ ดูแล','SECURITY','ทุกวัน 07:00 – 19:00','0833334455',true],['สันติ ปลอดภัย','SECURITY','ทุกวัน 19:00 – 07:00','0833334466',true],['ประดิษฐ์ ช่างดี','TECHNICIAN','จันทร์ – เสาร์ 09:00 – 18:00','0899998877',false]])
 sql += `\nINSERT INTO staff_directory(name,role,shift_schedule,phone_number,is_emergency) VALUES (${staff.slice(0,4).map(q).join(',')},${staff[4]}) ON CONFLICT DO NOTHING;`;
for(const rule of rules) sql += `\nINSERT INTO dorm_regulations(category,rule_title,rule_content,penalty_details) VALUES (${rule.map(q).join(',')}) ON CONFLICT DO NOTHING;`;
for(const table of ['room_types','rooms','utility_rates','meter_readings','staff_directory','dorm_regulations']) sql += `\nSELECT setval(pg_get_serial_sequence('${table}','id'),COALESCE((SELECT max(id) FROM ${table}),1));`;
sql += '\nCOMMIT;\n';
await writeFile(new URL('../seed.sql',import.meta.url),sql);
await writeFile(new URL('../database/ระบบฐานข้อมูลหอพัก.csv',import.meta.url),'\ufeff'+roomCsv);
await writeFile(new URL('../database/ฐานข้อมูลผู้ใช้งานระบบ.csv',import.meta.url),'\ufeffrole,รหัสนักศึกษา,ชื่อ-นามสกุลภาษาไทย,ชื่อ-นามสกุลภาษาอังกฤษ,เบอร์โทรศัพท์,Username,รหัสผ่าน 6 หลัก\n'+accounts.map(a=>[a[5],a[0],a[1],a[2],a[3],a[0]+'@cdti.ac.th',a[4]].join(',')).join('\n')+'\n');
console.log('Wrote seed.sql and the two source CSV files.');

