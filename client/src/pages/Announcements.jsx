import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,ArrowUpRight,CalendarDays,Search,Newspaper} from 'lucide-react';
import {announcements} from '../data/announcements';

function StoryImage({story,eager=false}){return <img src={story.image} alt={story.alt} loading={eager?'eager':'lazy'}/>;}
function Meta({story}){return <div className="news-meta"><span>{story.category}</span><time dateTime={story.date}><CalendarDays size={14}/>{story.dateLabel}</time></div>;}
export default function Announcements(){
 const {slug}=useParams(),[params,setParams]=useSearchParams(),query=params.get('q')||'',showAll=params.get('view')==='all',heading=useRef(null);
 const [input,setInput]=useState(query);
 useEffect(()=>{setInput(query);},[query]);
 useEffect(()=>{if(slug){heading.current?.focus();window.scrollTo(0,0);}},[slug]);
 const matches=useMemo(()=>announcements.filter(story=>[story.title,story.summary,story.category,...story.body].join(' ').toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th'))),[query]);
 const article=announcements.find(story=>story.slug===slug);
 function search(event){event.preventDefault();setParams(input.trim()?{q:input.trim(),view:'all'}:{view:'all'});}
 return <div className="announcements-page container">
  <div className="news-context"><span><Newspaper size={17}/> DataF Community <small lang="th" className="news-language" aria-label="ภาษาปัจจุบัน ภาษาไทย">TH</small></span></div>
  <div className="news-heading"><div><span className="eyebrow">NEWS & ANNOUNCEMENTS</span><h1>ประชาสัมพันธ์</h1><p>หอพักนักศึกษา สถาบันเทคโนโลยีจิตรลดา</p><p className="news-tagline">ข่าวกิจกรรมและเรื่องราวของเพื่อนชาวหอ DataF</p></div>{!slug&&<form className="news-search" role="search" onSubmit={search}><label className="sr-only" htmlFor="news-query">ค้นหาข่าวประชาสัมพันธ์</label><input id="news-query" type="search" value={input} onChange={event=>setInput(event.target.value)} placeholder="ค้นหาข่าวประชาสัมพันธ์" maxLength={160}/><button type="submit" aria-label="ค้นหาข่าว"><Search size={20}/></button></form>}</div>
  <p className="news-demo-note">กิจกรรมตัวอย่างของหอพัก · เรื่องราวและวันที่สมมติ ภาพใช้ประกอบเนื้อหา</p>
  {slug?article?<article className="news-article"><Link className="text-button" to="/announcements"><ArrowLeft size={17}/>กลับข่าวประชาสัมพันธ์</Link><Meta story={article}/><h2 ref={heading} tabIndex={-1}>{article.title}</h2><p className="news-article-summary">{article.summary}</p><StoryImage story={article} eager/><div className="news-article-body">{article.body.map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div><div className="news-article-disclosure">กิจกรรมตัวอย่างของหอพัก · เนื้อหาสมมติสำหรับ DataF{article.photoSource&&<><br/><a className="text-button" href={article.photoSource} target="_blank" rel="noreferrer">ที่มาภาพประกอบ<ArrowUpRight size={16}/></a></>}</div><Link className="button secondary" to="/announcements?view=all">ดูข่าวทั้งหมด<ArrowRight size={17}/></Link></article>:<div className="empty-state"><h2 ref={heading} tabIndex={-1}>ไม่พบบทความนี้</h2><Link className="text-button" to="/announcements">กลับข่าวประชาสัมพันธ์</Link></div>:
   <><div className="news-section-heading"><h2>{query?`ผลการค้นหา “${query}”`:showAll?'ข่าวประชาสัมพันธ์ทั้งหมด':'ข่าวล่าสุด'}</h2>{!showAll?<Link className="news-view-all" to="/announcements?view=all">ดูข่าวทั้งหมด<ArrowRight size={17}/></Link>:<Link className="text-button" to="/announcements">กลับข่าวล่าสุด</Link>}</div>
   {showAll||query?<><p className="news-result-count" role="status">พบ {matches.length} ข่าว</p>{matches.length?<div className="news-all-grid">{matches.map(story=><article key={story.slug}><Link className="news-grid-link" to={'/announcements/'+story.slug}><StoryImage story={story}/><Meta story={story}/><h3>{story.title}</h3><p>{story.summary}</p><span className="news-read-more">อ่านรายละเอียด<ArrowRight size={16}/></span></Link></article>)}</div>:<div className="empty-state">ไม่พบข่าวตามคำค้นนี้ ลองใช้คำว่า “หนังสือ” หรือ “กีฬา”<Link className="text-button" to="/announcements?view=all">ล้างการค้นหา</Link></div>}</>:
   <div className="news-feature-layout"><article className="news-feature"><Link to={'/announcements/'+announcements[0].slug}><StoryImage story={announcements[0]} eager/><div className="news-feature-copy"><Meta story={announcements[0]}/><h2>{announcements[0].title}</h2><p>{announcements[0].summary}</p><span className="news-read-more">อ่านรายละเอียด<ArrowRight size={18}/></span></div></Link></article><div className="news-side-list" aria-label="ข่าวล่าสุดเพิ่มเติม">{announcements.slice(1).map(story=><article key={story.slug}><Link to={'/announcements/'+story.slug}><StoryImage story={story}/><div><Meta story={story}/><h3>{story.title}</h3></div><ArrowUpRight className="news-story-arrow" size={18}/></Link></article>)}</div></div>}</>}
 </div>;
}



