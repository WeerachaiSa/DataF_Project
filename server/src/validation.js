import { z } from 'zod';
export class ApiError extends Error { constructor(status,message) { super(message); this.status = status; } }
export const uuid = z.string().uuid();
export const id = z.coerce.number().int().positive();
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, 'ใช้วันที่แรกของเดือน YYYY-MM-01');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=> !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s,'วันที่ไม่ถูกต้อง');
export const money = z.number().finite().min(0).max(99999999).multipleOf(0.01);
export const meter = z.object({room_id:id,billing_month:month,prev_water_unit:money,curr_water_unit:money,prev_electric_unit:money,curr_electric_unit:money}).strict().refine(v=>v.curr_water_unit>=v.prev_water_unit && v.curr_electric_unit>=v.prev_electric_unit,'เลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่าครั้งก่อน');
export const maintenance = z.object({category:z.enum(['AC','PLUMBING','ELECTRICAL','FURNITURE','OTHER']),description:z.string().trim().min(10).max(2000)}).strict();
export const lease = z.object({resident_id:uuid,start_date:date,end_date:date,deposit_paid:money}).strict().refine(v=>v.end_date>v.start_date,'วันสิ้นสุดต้องอยู่หลังวันเริ่มสัญญา');
export { z };
