import { Router } from 'express';
import { query } from './db.js';
import { z,id,ApiError } from './validation.js';
export const catalogRouter=Router();
const publicFields='id,room_number,floor,building,campus_zone,room_type_id,rent_rate,room_type,bed_type,area_sqm,amenities,description,deposit_amount,advance_payment,occupancy_status AS status,image_url,alt_text';
catalogRouter.get('/rooms',async(req,res)=>{
 const filters=z.object({floor:z.coerce.number().int().min(1).max(3).optional(),bed_type:z.enum(['SINGLE','TWIN']).optional(),status:z.enum(['VACANT','OCCUPIED','MAINTENANCE']).optional(),zone:z.string().max(50).optional()}).strict().parse(req.query);
 const values=[],where=[];
 for(const [key,value] of Object.entries(filters)) {values.push(value);where.push(`${({status:'occupancy_status',zone:'campus_zone'})[key]||key}=$${values.length}`);}
 const {rows}=await query(`SELECT ${publicFields} FROM room_inventory ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY room_number`,values);
 const stats=(await query("SELECT count(*)::int AS total,count(*) FILTER (WHERE occupancy_status='VACANT')::int AS available,count(*) FILTER (WHERE occupancy_status='OCCUPIED')::int AS occupied FROM room_inventory")).rows[0];
 res.json({rooms:rows,stats});
});
catalogRouter.get('/rooms/:id',async(req,res)=>{const {rows}=await query(`SELECT ${publicFields} FROM room_inventory WHERE id=$1`,[id.parse(req.params.id)]);if(!rows[0])throw new ApiError(404,'ไม่พบห้องพัก');res.json({room:rows[0]});});
catalogRouter.get('/room-types',async(req,res)=>res.json({room_types:(await query('SELECT * FROM room_types ORDER BY base_rent')).rows}));
