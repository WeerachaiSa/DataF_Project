import {createContext,useContext,useEffect,useState} from 'react';
import {Navigate,useLocation} from 'react-router-dom';
import {api} from './api';
const AuthContext=createContext(null);
export function AuthProvider({children}) {
 const [user,setUser]=useState(null),[room,setRoom]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function refresh(){try{const data=await api('/auth/me');setUser(data.user);setRoom(data.room);setError('');}catch(e){setUser(null);setRoom(null);if(e.status!==401)setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{refresh();},[]);
 async function login(email,password){const data=await api('/auth/login',{method:'POST',body:{email,password}});await refresh();return data.redirect;}
 async function logout(){await api('/auth/logout',{method:'POST',body:{}}).catch(e=>{if(e.status!==401)throw e;});window.location.replace('/');}
 return <AuthContext.Provider value={{user,room,loading,error,login,logout,refresh}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
export function Protected({role,children}){const {user,loading,error}=useAuth(),location=useLocation();if(loading)return <div className="page-state">กำลังตรวจสอบบัญชี…</div>;if(error)return <div className="page-state error" role="alert">{error}</div>;if(!user)return <Navigate to="/login" state={{from:location.pathname}} replace/>;if(role&&user.role!==role)return <Navigate to={user.role==='SUPER_ADMIN'?'/admin':'/resident'} replace/>;return children;}

