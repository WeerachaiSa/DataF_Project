import { Router } from 'express';
import { query,transaction,audit } from './db.js';
import { authenticate,requireRole } from './auth.js';
import { z,id,uuid,month,meter,maintenance,lease,ApiError } from './validation.js';
export const servicesRouter=Router();
servicesRouter.use(authenticate);
const admin=requireRole('SUPER_ADMIN'),resident=requireRole('STUDENT_RESIDENT');
const invoiceSelect=`SELECT i.*,r.room_number,m.prev_water_unit,m.curr_water_unit,m.prev_electric_unit,m.curr_electric_unit,
 ur.water_rate_per_unit,ur.electric_rate_per_unit,
 CASE WHEN i.status<>'PAID' AND i.due_date < (now() AT TIME ZONE 'Asia/Bangkok')::date THEN 'OVERDUE' ELSE i.status::text END AS display_status,
 p.id AS payment_notification_id,p.status AS payment_notification_status,p.note AS payment_note
 FROM invoices i JOIN rooms r ON r.id=i.room_id JOIN meter_readings m ON m.id=i.meter_reading_id JOIN utility_rates ur ON ur.id=i.utility_rate_id
 LEFT JOIN LATERAL (SELECT * FROM payment_notifications pn WHERE pn.invoice_id=i.id ORDER BY created_at DESC LIMIT 1) p ON true`;
servicesRouter.get('/staff',async(req,res)=>res.json({staff:(await query('SELECT * FROM staff_directory ORDER BY id')).rows}));
servicesRouter.get('/regulations',async(req,res)=>res.json({regulations:(await query('SELECT * FROM dorm_regulations ORDER BY id')).rows}));
servicesRouter.get('/utility-rates',async(req,res)=>res.json({rates:(await query('SELECT * FROM utility_rates ORDER BY effective_date DESC')).rows}));
servicesRouter.get('/invoices',async(req,res)=>{
 const {rows}=await query(invoiceSelect+(req.user.role==='SUPER_ADMIN'?'':' WHERE i.resident_id=$1')+' ORDER BY i.billing_cycle DESC,r.room_number',req.user.role==='SUPER_ADMIN'?[]:[req.user.id]);res.json({invoices:rows});
});
servicesRouter.get('/invoices/:id',async(req,res)=>{
 const values=[uuid.parse(req.params.id)],where=req.user.role==='SUPER_ADMIN'?'':` AND i.resident_id=$2`;
 if(where)values.push(req.user.id);
 const {rows}=await query(invoiceSelect+' WHERE i.id=$1'+where,values);
 if(!rows[0])throw new ApiError(404,'ไม่พบใบแจ้งหนี้');res.json({invoice:rows[0]});
});
servicesRouter.post('/invoices/:id/payment-notification',resident,async(req,res)=>{
 const invoiceId=uuid.parse(req.params.id),{note}=z.object({note:z.string().trim().max(500).default('')}).strict().parse(req.body);
 const result=await transaction(async db=>{
  const {rows}=await db.query('SELECT * FROM invoices WHERE id=$1 AND resident_id=$2 FOR UPDATE',[invoiceId,req.user.id]);
  if(!rows[0])throw new ApiError(404,'ไม่พบใบแจ้งหนี้');if(rows[0].status==='PAID')throw new ApiError(409,'ใบแจ้งหนี้นี้ชำระแล้ว');
  const notice=(await db.query('INSERT INTO payment_notifications(invoice_id,resident_id,note) VALUES ($1,$2,$3) RETURNING *',[invoiceId,req.user.id,note])).rows[0];
  await audit(db,req.user.id,'PAYMENT_NOTIFIED',invoiceId);return notice;
 });res.status(201).json({notification:result,message:'แจ้งชำระเงินแล้ว รอผู้ดูแลตรวจสอบ'});
});
servicesRouter.post('/invoices/:id/payment-review',admin,async(req,res)=>{
 const invoiceId=uuid.parse(req.params.id),{decision}=z.object({decision:z.enum(['APPROVED','REJECTED'])}).strict().parse(req.body);
 const result=await transaction(async db=>{
  const invoice=(await db.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE',[invoiceId])).rows[0];
  if(!invoice)throw new ApiError(404,'ไม่พบใบแจ้งหนี้');if(invoice.status==='PAID')throw new ApiError(409,'ชำระแล้ว');
  const {rows}=await db.query("UPDATE payment_notifications SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE invoice_id=$1 AND status='SUBMITTED' RETURNING *",[invoiceId,decision,req.user.id]);
  if(!rows[0])throw new ApiError(409,'ไม่มีการแจ้งชำระเงินที่รอตรวจสอบ');
  if(decision==='APPROVED')await db.query("UPDATE invoices SET status='PAID',paid_at=now() WHERE id=$1",[invoiceId]);
  await audit(db,req.user.id,'PAYMENT_'+decision,invoiceId);return rows[0];
 });res.json({notification:result});
});
servicesRouter.get('/maintenance',async(req,res)=>{
 const {rows}=await query(`SELECT m.*,r.room_number FROM maintenance_requests m JOIN rooms r ON r.id=m.room_id ${req.user.role==='SUPER_ADMIN'?'':'WHERE m.resident_id=$1'} ORDER BY m.created_at DESC`,req.user.role==='SUPER_ADMIN'?[]:[req.user.id]);res.json({requests:rows});
});
servicesRouter.post('/maintenance',resident,async(req,res)=>{
 const data=maintenance.parse(req.body);
 const result=await transaction(async db=>{
  const active=(await db.query('SELECT room_id FROM leases WHERE resident_id=$1 AND contract_active FOR SHARE',[req.user.id])).rows[0];
  if(!active)throw new ApiError(409,'บัญชีนี้ยังไม่มีห้องพักที่ใช้งานอยู่');
  const ticket=(await db.query('INSERT INTO maintenance_requests(room_id,resident_id,category,description) VALUES ($1,$2,$3,$4) RETURNING *',[active.room_id,req.user.id,data.category,data.description])).rows[0];
  await audit(db,req.user.id,'MAINTENANCE_CREATED',ticket.id);return ticket;
 });res.status(201).json({request:result});
});
servicesRouter.patch('/maintenance/:id',admin,async(req,res)=>{
 const ticketId=id.parse(req.params.id),{status}=z.object({status:z.enum(['REPORTED','IN_PROGRESS','RESOLVED'])}).strict().parse(req.body);
 const result=await transaction(async db=>{const {rows}=await db.query('UPDATE maintenance_requests SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',[ticketId,status]);if(!rows[0])throw new ApiError(404,'ไม่พบรายการแจ้งซ่อม');await audit(db,req.user.id,'MAINTENANCE_UPDATED',ticketId,{status});return rows[0];});res.json({request:result});
});
servicesRouter.get('/admin/overview',admin,async(req,res)=>{
 const [rooms,bills,tickets]=await Promise.all([
  query("SELECT count(*)::int AS total,count(*) FILTER (WHERE occupancy_status='OCCUPIED')::int AS occupied,count(*) FILTER (WHERE occupancy_status='VACANT')::int AS available,count(*) FILTER (WHERE occupancy_status='MAINTENANCE')::int AS maintenance FROM room_inventory"),
  query("SELECT COALESCE(sum(total_amount) FILTER(WHERE status='PAID'),0) AS collected,COALESCE(sum(total_amount) FILTER(WHERE status<>'PAID'),0) AS outstanding,(SELECT count(*)::int FROM payment_notifications WHERE status='SUBMITTED') AS payment_reviews FROM invoices"),
  query("SELECT count(*)::int AS open FROM maintenance_requests WHERE status<>'RESOLVED'")
 ]);res.json({rooms:rooms.rows[0],billing:bills.rows[0],maintenance:tickets.rows[0]});
});
servicesRouter.get('/admin/rooms',admin,async(req,res)=>res.json({rooms:(await query('SELECT ri.*,u.full_name_th AS resident_name FROM room_inventory ri LEFT JOIN users u ON u.id=ri.current_resident_id ORDER BY room_number')).rows}));
servicesRouter.get('/admin/residents',admin,async(req,res)=>res.json({residents:(await query("SELECT u.id,u.student_id,u.full_name_th,u.email,u.phone_number,l.room_id,r.room_number FROM users u LEFT JOIN leases l ON l.resident_id=u.id AND l.contract_active LEFT JOIN rooms r ON r.id=l.room_id WHERE u.role='STUDENT_RESIDENT' ORDER BY u.student_id")).rows}));
servicesRouter.post('/rooms/:id/lease',admin,async(req,res)=>{
 const roomId=id.parse(req.params.id),data=lease.parse(req.body);
 const result=await transaction(async db=>{
  const room=(await db.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];
  if(!room)throw new ApiError(404,'ไม่พบห้องพัก');if(room.status==='MAINTENANCE')throw new ApiError(409,'ห้องนี้อยู่ระหว่างซ่อมบำรุง');
  const user=(await db.query("SELECT id FROM users WHERE id=$1 AND role='STUDENT_RESIDENT' FOR UPDATE",[data.resident_id])).rows[0];
  if(!user)throw new ApiError(400,'ต้องเลือกบัญชีผู้พักอาศัย');
  const row=(await db.query('INSERT INTO leases(room_id,resident_id,start_date,end_date,deposit_paid) VALUES ($1,$2,$3,$4,$5) RETURNING *',[roomId,data.resident_id,data.start_date,data.end_date,data.deposit_paid])).rows[0];
  await audit(db,req.user.id,'LEASE_CREATED',row.id,{room_id:roomId});return row;
 });res.status(201).json({lease:result});
});
servicesRouter.post('/leases/:id/end',admin,async(req,res)=>{
 const leaseId=uuid.parse(req.params.id);
 const result=await transaction(async db=>{const {rows}=await db.query('UPDATE leases SET contract_active=false WHERE id=$1 AND contract_active RETURNING *',[leaseId]);if(!rows[0])throw new ApiError(404,'ไม่พบสัญญาที่ใช้งาน');await audit(db,req.user.id,'LEASE_ENDED',leaseId);return rows[0];});res.json({lease:result});
});
servicesRouter.patch('/rooms/:id/status',admin,async(req,res)=>{
 const roomId=id.parse(req.params.id),{status}=z.object({status:z.enum(['VACANT','MAINTENANCE'])}).strict().parse(req.body);
 await transaction(async db=>{const room=(await db.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[roomId])).rows[0];if(!room)throw new ApiError(404,'ไม่พบห้องพัก');if((await db.query('SELECT id FROM leases WHERE room_id=$1 AND contract_active',[roomId])).rowCount)throw new ApiError(409,'กรุณาสิ้นสุดสัญญาก่อนเปลี่ยนสถานะ');await db.query('UPDATE rooms SET status=$2 WHERE id=$1',[roomId,status]);await audit(db,req.user.id,'ROOM_STATUS_CHANGED',roomId,{status});});res.json({status});
});
servicesRouter.get('/meter-readings',admin,async(req,res)=>res.json({readings:(await query('SELECT m.*,r.room_number FROM meter_readings m JOIN rooms r ON r.id=m.room_id ORDER BY billing_month DESC,room_number')).rows}));
servicesRouter.post('/meter-readings',admin,async(req,res)=>{
 const data=meter.parse(req.body);
 const result=await transaction(async db=>{
  const room=(await db.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[data.room_id])).rows[0];if(!room)throw new ApiError(404,'ไม่พบห้องพัก');
  const last=(await db.query('SELECT * FROM meter_readings WHERE room_id=$1 ORDER BY billing_month DESC LIMIT 1',[data.room_id])).rows[0];
  if(last && last.billing_month>=data.billing_month)throw new ApiError(409,'ต้องบันทึกเดือนถัดจากรายการล่าสุด และไม่ซ้ำเดือนเดิม');
  if(last && (Number(last.curr_water_unit)!==data.prev_water_unit||Number(last.curr_electric_unit)!==data.prev_electric_unit))throw new ApiError(409,'เลขครั้งก่อนต้องตรงกับเลขปัจจุบันของเดือนล่าสุด');
  const row=(await db.query('INSERT INTO meter_readings(room_id,billing_month,prev_water_unit,curr_water_unit,prev_electric_unit,curr_electric_unit) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',Object.values(data))).rows[0];
  await audit(db,req.user.id,'METER_RECORDED',row.id);return row;
 });res.status(201).json({reading:result});
});
servicesRouter.post('/invoices/generate',admin,async(req,res)=>{
 const {room_id,billing_cycle}=z.object({room_id:id,billing_cycle:month}).strict().parse(req.body);
 const result=await transaction(async db=>{
  const room=(await db.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[room_id])).rows[0];if(!room)throw new ApiError(404,'ไม่พบห้องพัก');
  const active=(await db.query('SELECT * FROM leases WHERE room_id=$1 AND contract_active AND start_date<=($2::date + interval \'1 month\' - interval \'1 day\') AND end_date>=$2::date FOR SHARE',[room_id,billing_cycle])).rows[0];
  if(!active)throw new ApiError(409,'ไม่พบสัญญาที่ครอบคลุมรอบบิลนี้');
  const reading=(await db.query('SELECT id FROM meter_readings WHERE room_id=$1 AND billing_month=$2',[room_id,billing_cycle])).rows[0];if(!reading)throw new ApiError(409,'กรุณาบันทึกมิเตอร์ของเดือนนี้ก่อน');
  const rate=(await db.query('SELECT id FROM utility_rates WHERE effective_date<=$1 ORDER BY effective_date DESC LIMIT 1',[billing_cycle])).rows[0];if(!rate)throw new ApiError(409,'ไม่พบอัตราค่าสาธารณูปโภค');
  const row=(await db.query(`INSERT INTO invoices(invoice_number,room_id,resident_id,meter_reading_id,utility_rate_id,billing_cycle,rent_amount,water_amount,electric_amount,due_date)
   SELECT 'DF-'||to_char($1::date,'YYYYMM')||'-'||r.room_number,r.id,$2,m.id,ur.id,$1,r.rent_rate,round((m.curr_water_unit-m.prev_water_unit)*ur.water_rate_per_unit,2),round((m.curr_electric_unit-m.prev_electric_unit)*ur.electric_rate_per_unit,2),$1::date+4
   FROM rooms r JOIN meter_readings m ON m.id=$3 JOIN utility_rates ur ON ur.id=$4 WHERE r.id=$5 RETURNING *`,[billing_cycle,active.resident_id,reading.id,rate.id,room_id])).rows[0];
  await audit(db,req.user.id,'INVOICE_GENERATED',row.id);return row;
 });res.status(201).json({invoice:result});
});

