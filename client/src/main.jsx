import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter,Routes,Route,Link,Navigate} from 'react-router-dom';
import {AuthProvider,Protected,useAuth} from './auth';
import Layout from './components/Layout';
import PublicCatalog from './pages/PublicCatalog';
import LoginPage from './pages/LoginPage';
import ResidentPortal from './pages/ResidentPortal';
import AdminDashboard from './pages/AdminDashboard';
import Announcements from './pages/Announcements';
import HomeLanding from './pages/HomeLanding';
import './styles.css';
function SearchPage(){const {user,loading,error}=useAuth();if(loading)return <div className="page-state">กำลังตรวจสอบบัญชี…</div>;if(error)return <div className="page-state error" role="alert">{error}</div>;return user?<Navigate to="/announcements" replace/>:<PublicCatalog/>;}
function NotFound(){return <div className="page-state">ไม่พบหน้าที่ต้องการ <Link to="/">กลับหน้าหลัก</Link></div>;}
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><AuthProvider><Layout><Routes><Route path="/" element={<HomeLanding/>}/><Route path="/search" element={<SearchPage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/announcements" element={<Protected><Announcements/></Protected>}/><Route path="/announcements/:slug" element={<Protected><Announcements/></Protected>}/><Route path="/resident" element={<Protected role="STUDENT_RESIDENT"><ResidentPortal/></Protected>}/><Route path="/admin" element={<Protected role="SUPER_ADMIN"><AdminDashboard/></Protected>}/><Route path="*" element={<NotFound/>}/></Routes></Layout></AuthProvider></BrowserRouter></React.StrictMode>);
