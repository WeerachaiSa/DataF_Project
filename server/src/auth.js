import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { query,transaction,audit } from './db.js';
import { ApiError,z } from './validation.js';
const safeUser = u => ({id:u.id,student_id:u.student_id,full_name_th:u.full_name_th,full_name_en:u.full_name_en,email:u.email,role:u.role});
const cookieOptions = { httpOnly:true, secure:config.production, sameSite:'lax', path:'/api/v1' };
const dummyHash = await bcrypt.hash('invalid-login-placeholder',12);
export async function authenticate(req,res,next) {
 const token = req.cookies[config.cookieName];
 if(!token) throw new ApiError(401,'กรุณาเข้าสู่ระบบ');
 let claims;
 try { claims = jwt.verify(token,config.secret,{algorithms:['HS256'],issuer:'dataf',audience:'dataf-web'}); }
 catch { throw new ApiError(401,'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'); }
 const {rows} = await query(`SELECT u.*,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()`,[claims.jti,claims.sub]);
 if(!rows[0]) throw new ApiError(401,'เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง');
 req.user=safeUser(rows[0]); req.sessionId=rows[0].session_id; next();
}
export const requireRole = role => (req,res,next) => { if(req.user.role!==role) throw new ApiError(403,'บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้'); next(); };
async function issue(db,res,user) {
 const sid=randomUUID();
 await db.query(`INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,now()+($3*interval '1 second'))`,[sid,user.id,config.sessionSeconds]);
 const token=jwt.sign({},config.secret,{algorithm:'HS256',subject:user.id,jwtid:sid,issuer:'dataf',audience:'dataf-web',expiresIn:config.sessionSeconds});
 res.cookie(config.cookieName,token,{...cookieOptions,maxAge:config.sessionSeconds*1000});
 return {user:safeUser(user),redirect:user.role==='SUPER_ADMIN'?'/admin':'/resident'};
}
export const authRouter=Router();
const loginLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,skipSuccessfulRequests:true,message:{error:'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที'}});
authRouter.post('/login',loginLimit,async(req,res)=>{
 const {email,password}=z.object({email:z.string().email().max(255).transform(s=>s.toLowerCase().trim()),password:z.string().min(1).max(128)}).strict().parse(req.body);
 const {rows}=await query('SELECT * FROM users WHERE email=$1',[email]);
 const valid=await bcrypt.compare(password,rows[0]?.password_hash||dummyHash);
 if(!rows[0]||!valid) throw new ApiError(401,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
 const response=await transaction(async db=>{const result=await issue(db,res,rows[0]);await audit(db,rows[0].id,'AUTH_LOGIN',rows[0].id);return result;});
 res.json(response);
});
authRouter.get('/me',authenticate,async(req,res)=>{
 const {rows}=await query(`SELECT room_id,room_number,floor,building FROM leases JOIN rooms ON rooms.id=leases.room_id WHERE resident_id=$1 AND contract_active`,[req.user.id]);
 res.json({user:req.user,room:rows[0]||null});
});
authRouter.post('/refresh',authenticate,async(req,res)=>{
 const response=await transaction(async db=>{
  const {rowCount}=await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[req.sessionId]);
  if(!rowCount) throw new ApiError(401,'เซสชันหมดอายุ');
  return issue(db,res,req.user);
 });res.json(response);
});
authRouter.post('/logout',authenticate,async(req,res)=>{
 await query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1',[req.sessionId]);
 res.clearCookie(config.cookieName,cookieOptions);res.status(204).end();
});
