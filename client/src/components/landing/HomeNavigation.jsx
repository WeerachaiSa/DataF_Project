import {Link} from 'react-router-dom';
import {Search,ArrowUpRight,ArrowRight} from 'lucide-react';
import {useAuth} from '../../auth';

export default function HomeNavigation(){
 const {user}=useAuth();
 return <>
  <a className="home-skip" href="#home-main">ข้ามไปเนื้อหา</a>
  <header className="home-header"><div className="home-wrap home-header-inner">
   <Link to="/" className="home-brand" aria-label="DataF หน้าหลัก"><img src="/logo.png" alt=""/><span>Data<span>F</span><small>STUDENT LIVING</small></span></Link>
   <nav className="home-section-nav" aria-label="รู้จัก DataF"><a href="#home-living">ชีวิตที่ DataF</a><a href="#home-services">บริการของเรา</a>{user&&<Link to="/announcements">ประชาสัมพันธ์</Link>}</nav>
   <nav className="home-action-hub" aria-label="ค้นหาห้องพักและบัญชี">
    <Link className="home-login-link" to="/login">{user?'บัญชีของฉัน':'เข้าสู่ระบบ'}<ArrowUpRight size={16}/></Link>
    <Link className="home-search-link" to="/search"><Search size={17}/>ค้นหาห้องพัก</Link>
   </nav>
  </div></header>
  <nav className="home-mobile-actions" aria-label="เมนูด่วนบนมือถือ"><Link to="/login">{user?'บัญชีของฉัน':'เข้าสู่ระบบ'}<ArrowRight size={16}/></Link><Link className="home-search-link" to="/search"><Search size={18}/>ค้นหาห้องพัก</Link></nav>
 </>;
}
