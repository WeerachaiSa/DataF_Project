export async function api(path,options={}) {
 const response=await fetch('/api/v1'+path,{...options,credentials:'include',headers:{'Content-Type':'application/json','X-DataF-Request':'1',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
 if(response.status===204)return null;
 const data=await response.json();
 if(!response.ok){const error=new Error(data.details?.[0]?.message||data.error||'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');error.status=response.status;throw error;}
 return data;
}
export const baht=value=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:2}).format(Number(value));
export const thaiDate=value=>new Date(value).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
export const monthLabel=value=>new Date(value).toLocaleDateString('th-TH',{month:'long',year:'numeric'});
