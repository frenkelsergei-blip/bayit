import {detectInsuranceHeader,insuranceTextKey,cleanInsuranceText,insuranceIdentity} from './insurance.mjs';
// Transient report data only. Never attach a national ID to a saved policy.
export const normalizeInsuranceId=value=>{const id=cleanInsuranceText(value).replace(/[\s-]/g,'');return /^\d{9}$/.test(id)?id:null};
export function insuranceReportIdentities(tables){
 const rows=new Map(),ids=new Set();
 for(const table of tables){const header=detectInsuranceHeader(table.rows),column=(table.rows[header.index]||[]).findIndex(v=>['תעודתזהות','מספרזהות','מספרתעודתזהות','idnumber'].includes(insuranceTextKey(v)));if(column<0)continue;
  for(let i=header.index+1;i<table.rows.length;i++){const raw=cleanInsuranceText(table.rows[i][column]);if(!raw)continue;rows.set(table.name+'|'+(i+1),raw);ids.add(raw)}
 }
 return {rows,ids:[...ids]};
}
export function assignInsuranceReportPerson(policy,memberId,{name,existing=[],actorId}={}){
 const base=p=>insuranceIdentity({...p,insuredName:'',memberIds:[]}),matches=existing.filter(p=>!p.deletedAt&&p.ownerId===actorId&&p.memberIds?.length===1&&p.memberIds[0]===memberId&&base(p)===base(policy));
 // A renamed/localized profile must not duplicate an existing imported coverage.
 return {...policy,memberIds:[memberId],insuredName:policy.insuredName||(matches.length===1?matches[0].insuredName:'')||name||''};
}
