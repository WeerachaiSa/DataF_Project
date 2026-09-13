import {useEffect,useRef} from 'react';
import {X,LoaderCircle,AlertCircle,CheckCircle2} from 'lucide-react';
const statusLabels={VACANT:'ว่างพร้อมเข้าอยู่',OCCUPIED:'มีผู้พักอาศัย',MAINTENANCE:'ปรับปรุงห้อง',PENDING:'รอชำระ',OVERDUE:'เกินกำหนด',PAID:'ชำระแล้ว',SUBMITTED:'รอตรวจสอบ',REJECTED:'กรุณาแจ้งใหม่',APPROVED:'ตรวจสอบแล้ว',REPORTED:'รับเรื่องแล้ว',IN_PROGRESS:'กำลังดำเนินการ',RESOLVED:'เรียบร้อยแล้ว'};
export function Badge({status}){return <span className={`badge badge-${status.toLowerCase()}`}>{statusLabels[status]||status}</span>;}
export function Notice({error,success}){if(!error&&!success)return null;const Icon=error?AlertCircle:CheckCircle2;return <div className={`notice ${error?'error':'success'}`} role={error?'alert':'status'}><Icon size={18}/><span>{error||success}</span></div>;}
export function Loading(){return <div className="page-state" role="status"><LoaderCircle className="spin"/>กำลังโหลดข้อมูล…</div>;}
export function Empty({children}){return <div className="empty-state">{children}</div>;}
export function Modal({title,children,onClose}){
 const ref=useRef(null),closeRef=useRef(null);
 useEffect(()=>{const el=ref.current;el.showModal();closeRef.current?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=old;};},[]);
 return <dialog className="modal" ref={ref} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}} aria-label={title}><div className="modal-heading"><h2>{title}</h2><button ref={closeRef} className="icon-button" aria-label="ปิด" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
export function Field({label,children,hint}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
