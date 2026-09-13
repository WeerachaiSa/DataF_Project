import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config,root } from './config.js';
import { query } from './db.js';
import { authRouter } from './auth.js';
import { catalogRouter } from './catalog.js';
import { servicesRouter } from './services.js';
import { ApiError } from './validation.js';
export const app=express();
app.disable('x-powered-by');
// The local Draco decoder needs a Blob worker and WebAssembly compilation.
// Keep script sources local; never enable general-purpose unsafe-eval.
app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'},contentSecurityPolicy:{directives:{scriptSrc:["'self'","'wasm-unsafe-eval'"],workerSrc:["'self'",'blob:']}}}));
app.use(cors({origin:config.origins,credentials:true}));
app.use(express.json({limit:'16kb'}));
app.use(cookieParser());
app.use('/api', (req,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
  const origin=req.get('Origin');
  const sameOrigin=`${req.protocol}://${req.get('host')}`;
  if((origin && !config.origins.includes(origin) && origin!==sameOrigin)||req.get('Sec-Fetch-Site')==='cross-site')throw new ApiError(403,'คำขอจากเว็บไซต์นี้ไม่ได้รับอนุญาต');
  if(req.get('X-DataF-Request')!=='1')throw new ApiError(403,'คำขอต้องมาจากแอป DataF');
 }next();
});
app.get('/api/v1/health',async(req,res)=>{await query('SELECT 1');res.json({status:'ok',service:'dataf-api',database:'connected'});});
app.use('/api/v1/auth',authRouter);
app.use('/api/v1',catalogRouter);
app.use('/api/v1',servicesRouter);
app.use('/api',(_req,res)=>res.status(404).json({error:'ไม่พบ API ที่ร้องขอ'}));
app.use('/room-images',express.static(path.join(root,'รูปห้องพัก'),{maxAge:'1d'}));
app.use('/รูปห้องพัก',express.static(path.join(root,'รูปห้องพัก'),{maxAge:'1d'}));
const dist=path.join(root,'client','dist');
if(existsSync(path.join(dist,'index.html'))) {
 app.use(express.static(dist));
 app.get(['/', '/search', '/login', '/admin', '/resident', '/announcements', '/announcements/:slug'],(_req,res)=>res.sendFile(path.join(dist,'index.html')));
}
app.use((_req,res)=>res.status(404).json({error:'ไม่พบหน้าที่ร้องขอ'}));
app.use((error,req,res,_next)=>{
 if(error.name==='ZodError')return res.status(400).json({error:'ข้อมูลไม่ถูกต้อง',details:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
 if(error.code==='23505')return res.status(409).json({error:'มีข้อมูลนี้แล้ว หรือรายการนี้กำลังรอดำเนินการ'});
 if(error.code==='23503'||error.code==='23514'||error.code==='22P02')return res.status(400).json({error:'ข้อมูลอ้างอิงหรือค่าที่ระบุไม่ถูกต้อง'});
 const status=error.status||500;
 if(status>=500)console.error({message:error.message,code:error.code,path:req.path});
 res.status(status).json({error:status>=500?'ระบบไม่พร้อมใช้งาน กรุณาลองอีกครั้ง':error.message});
});
