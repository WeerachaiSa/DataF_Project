import {Link,NavLink,useLocation} from 'react-router-dom';
import {ArrowUpRight,LogOut,Building2,ShieldCheck} from 'lucide-react';
import {useAuth} from '../auth';
import {useState} from 'react';
import {Notice} from './UI';
export default function Layout({children}){
 const {user,logout}=useAuth(),[error,setError]=useState('');
 const {pathname}=useLocation();
 if(pathname==='/')return children;
 return <><div className="topline"><span>หอพักนักศึกษา DataF</span><span><ShieldCheck size={13}/> ดูแลตลอด 24 ชั่วโมง</span></div><header className="site-header"><div className="header-inner"><Link to={user?"/announcements":"/"} className="brand" aria-label="DataF หน้าหลัก"><img src="/logo.png" alt=""/><span>Data<span className="brand-f">F</span><small>STUDENT LIVING</small></span></Link><nav aria-label="เมนูหลัก">{user?<NavLink to="/announcements">ประชาสัมพันธ์</NavLink>:<NavLink to="/search" end>ค้นหาห้องพัก</NavLink>}{user&&<NavLink to={user.role==='SUPER_ADMIN'?'/admin':'/resident'}>{user.role==='SUPER_ADMIN'?'จัดการหอพัก':'บริการผู้พักอาศัย'}</NavLink>}</nav>{user?<div className="account-nav"><span>{user.full_name_th.split(' ')[0]}</span><button className="icon-button" aria-label="ออกจากระบบ" onClick={async()=>{try{await logout();}catch(e){setError(e.message);}}}><LogOut size={19}/></button></div>:<Link className="button primary small" to="/login">เข้าสู่ระบบ <ArrowUpRight size={17}/></Link>}</div></header>{error&&<Notice error={error}/>}<main>{children}</main><footer><div className="footer-inner"><span><Building2 size={18}/> DataF · Student Dormitory Management</span><span>พื้นที่พักอาศัยที่พร้อมสำหรับชีวิตนักศึกษา</span><small>© 2026 DataF</small></div></footer></>;
}

