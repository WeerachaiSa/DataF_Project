import {Component,lazy,Suspense,useEffect} from 'react';
import {Link} from 'react-router-dom';
import {ArrowDown,ArrowRight,ArrowUpRight,Search,Wifi,Wind,Armchair,ShieldCheck,ReceiptText,Wrench,Phone,BookOpen,Building2} from 'lucide-react';
import HomeNavigation from '../components/landing/HomeNavigation';
import './home-landing.css';

const DormitoryCanvas=lazy(()=>import('../components/landing/DormitoryCanvas'));
function ScenePlaceholder({failed=false}){return <div className="home-scene-placeholder" role="status"><Building2 size={72} strokeWidth={1}/><span>{failed?'พื้นที่ดี ๆ พร้อมให้คุณค้นพบ':'กำลังเตรียมบ้านหลังใหม่ของคุณ…'}</span><small>{failed?'ดูห้องพักและรายละเอียดได้ที่หน้าค้นหาห้องพัก':'DATAF · STUDENT LIVING'}</small></div>;}
class SceneBoundary extends Component{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<ScenePlaceholder failed/>:this.props.children;}
}
const services=[
 {icon:ReceiptText,no:'01',title:'บิลหอพัก',text:'ดูค่าเช่า ค่าน้ำ ค่าไฟ และแจ้งชำระเงินได้ในที่เดียว'},
 {icon:Wrench,no:'02',title:'แจ้งซ่อม',text:'บอกปัญหาในห้อง แล้วติดตามสถานะงานจากผู้ดูแล'},
 {icon:Phone,no:'03',title:'ติดต่อผู้ดูแล',text:'หาช่องทางติดต่อเจ้าหน้าที่และเวลาที่พร้อมดูแลคุณ'},
 {icon:BookOpen,no:'04',title:'กฎการอยู่ร่วมกัน',text:'รู้ข้อตกลงของหอพัก เพื่อให้ทุกวันเป็นวันที่น่าอยู่'},
];
export default function HomeLanding(){
 useEffect(()=>{const previous=document.title;document.title='DataF · พื้นที่ของคุณ จุดเริ่มต้นของวันดี ๆ';return()=>{document.title=previous;};},[]);
 return <div className="home-page">
  <HomeNavigation/>
  <main id="home-main">
   <section className="home-hero home-wrap" aria-labelledby="home-heading">
    <div className="home-hero-copy">
     <p className="home-eyebrow"><span/> YOUR SPACE. YOUR NEXT CHAPTER.</p>
     <h1 id="home-heading">พื้นที่ของคุณ<br/>จุดเริ่มต้นของ<br/><span>วันดี ๆ<span className="home-title-dot">.</span></span></h1>
     <p className="home-lead">ห้องที่พร้อมให้พัก ชีวิตที่พร้อมให้เริ่ม<br/>ค้นพบหอพักนักศึกษา DataF และใช้เวลา<br className="home-wide-break"/>กับสิ่งที่สำคัญในรั้วมหาวิทยาลัย</p>
     <Link to="/search" className="home-search-trigger"><span className="home-trigger-icon"><Search size={23}/></span><span><strong>เริ่มค้นหาห้องที่ใช่</strong><small>เลือกประเภทห้อง ชั้น และงบที่เหมาะกับคุณ</small></span><ArrowRight size={22}/></Link>
     <div className="home-hero-meta"><span>หอพักนักศึกษา · CDTI</span><span>STAY. STUDY. GROW.</span></div>
    </div>
    <div className="home-visual">
     <div className="home-visual-top"><span><i/> A PLACE TO CALL YOURS</span><span>01 / THE RESIDENCE</span></div>
     <SceneBoundary><Suspense fallback={<ScenePlaceholder/>}><DormitoryCanvas/></Suspense></SceneBoundary>
     <div className="home-visual-foot"><span>ออกแบบพื้นที่ เพื่อทุกจังหวะชีวิต</span><small>โมเดลจำลองเพื่อประกอบการนำเสนอ</small></div>
    </div>
   </section>
   <div className="home-facts home-wrap"><div><strong>18<span>ห้อง</span></strong><p>พื้นที่ส่วนตัวที่เลือกได้</p></div><div><strong>3<span>ชั้น</span></strong><p>ในอาคารหอพักเดียวกัน</p></div><div><strong>2<span>รูปแบบ</span></strong><p>ห้องเตียงเดี่ยวและเตียงคู่</p></div><a href="#home-living">ทำความรู้จักบ้านหลังนี้<ArrowDown size={19}/></a></div>
   <section id="home-living" className="home-living home-wrap" aria-labelledby="living-heading">
    <div className="home-section-heading"><p className="home-eyebrow">MORE THAN A ROOM</p><h2 id="living-heading">มากกว่าที่พัก<br/>คือพื้นที่ให้คุณเป็นตัวเอง</h2><p>พักให้เต็มที่ เรียนรู้ให้เต็มวัน<br/>เริ่มต้นด้วยสิ่งจำเป็นที่พร้อมอยู่รอบตัว</p></div>
    <div className="home-living-grid">
     <article className="home-living-feature"><div className="home-living-art" aria-hidden="true"><span className="home-art-window"/><span className="home-art-floor"/><span className="home-art-bed"/><span className="home-art-pillow"/><span className="home-art-desk"/><span className="home-art-book"/></div><div><span className="home-eyebrow">MADE FOR STUDENT LIFE</span><h3>วางกระเป๋า<br/>แล้วเริ่มบทใหม่ได้เลย</h3><p>ห้องพักพร้อมเฟอร์นิเจอร์ พื้นที่อ่านหนังสือ<br/>และมุมพักผ่อนในแบบของคุณ</p><Link to="/search">สำรวจห้องพัก<ArrowUpRight size={20}/></Link></div></article>
     <div className="home-amenities">{[[Armchair,'พร้อมเข้าอยู่','เฟอร์นิเจอร์สำหรับชีวิตประจำวัน'],[Wifi,'เชื่อมต่อการเรียนรู้','Wi-Fi สำหรับวันเรียนและวันพัก'],[Wind,'พักสบายในห้องของคุณ','เครื่องปรับอากาศและห้องน้ำในตัว'],[ShieldCheck,'มีผู้ดูแลให้ติดต่อ','ช่องทางติดต่อเจ้าหน้าที่ผ่านระบบ']].map(([Icon,title,text])=><article key={title}><span><Icon size={24} strokeWidth={1.5}/></span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
    </div>
    <p className="home-data-note">ข้อมูลและภาพจำลองสำหรับสาธิตระบบ · กรุณายืนยันรายละเอียดห้องพักกับผู้ดูแลก่อนเข้าพัก</p>
   </section>
   <section id="home-services" className="home-services" aria-labelledby="services-heading"><div className="home-wrap"><div className="home-services-heading"><div><p className="home-eyebrow">LESS HASSLE. MORE LIVING.</p><h2 id="services-heading">เรื่องหอพัก จัดการง่าย<br/>ในพื้นที่เดียว</h2></div><Link to="/login">บริการสำหรับผู้พักอาศัย<ArrowUpRight size={19}/></Link></div><div className="home-service-grid">{services.map(({icon:Icon,no,title,text})=><article key={no}><div><Icon size={28} strokeWidth={1.4}/><span>{no}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
   <section className="home-closing home-wrap"><div><p className="home-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h2>พร้อมเจอห้องที่เป็นคุณแล้วหรือยัง?</h2><p>ดูห้องพัก เปรียบเทียบราคา แล้วค่อยเลือกพื้นที่ที่เหมาะกับชีวิตคุณ</p></div><Link className="home-search-link" to="/search">ไปดูห้องพักทั้งหมด<ArrowRight size={20}/></Link></section>
  </main>
  <footer className="home-footer"><div className="home-wrap"><Link to="/" className="home-footer-brand">Data<span>F</span><small>STUDENT LIVING</small></Link><p>พื้นที่พักอาศัยที่พร้อมสำหรับชีวิตนักศึกษา</p><span>© 2026 DataF</span></div></footer>
 </div>;
}
