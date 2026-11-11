// "Lent & borrowed" screen. Built only from the shared kit it receives (ui) and the records API; no new styles.
// New records start as "Only me"; the owner shares them with the shared sharing control (ui.RecordAccess) later.
import React,{useState} from 'react';

export default function LendingScreen({app:a,ui,records,create,save,remove}){
 const {Heading,Button,Empty}=ui,T=a.T,[title,setTitle]=useState('');
 const items=records('items'),mine=r=>r.ownerId===a.user;
 const add=e=>{e.preventDefault();const t=title.trim();if(!t)return;save('items',create('items',{title:t,direction:'lent',returned:false}));setTitle('')};
 return <section>
  <Heading title={T('Lent & borrowed','השאלות')} subtitle={T('What we lent or borrowed, and from whom.','מה השאלנו או שאלנו, וממי.')}/>
  <form onSubmit={add}>
   <label>{T('What','מה')} <input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></label>
   <Button type="submit">{T('Add','הוספה')}</Button>
  </form>
  {items.length?<ul>{items.map(r=><li key={r.id}>
   <span>{r.title}</span> <span>{r.person||''}</span> <span>{r.returned?T('Returned','הוחזר'):r.direction==='borrowed'?T('Borrowed','שאלנו'):T('Lent','השאלנו')}</span>
   {mine(r)&&!r.returned&&<Button secondary onClick={()=>save('items',{...r,returned:true})}>{T('Mark returned','סימון שהוחזר')}</Button>}
   {mine(r)&&<Button quiet onClick={()=>remove('items',r.id)}>{T('Remove','הסרה')}</Button>}
  </li>)}</ul>:<Empty text={T('Nothing lent or borrowed yet.','עדיין לא השאלנו ולא שאלנו כלום.')}/>}
 </section>;
}
