// Demo (sample household, not signed in): Expenses shows the manual ledger, plus the same "Who we pay" view the
// signed-in Expenses has, built from fictional sample statements so the demo shows real providers.
import React,{useMemo,useState} from 'react';
import {ExpensesView} from './expenses-view';
import {ProvidersView,useProviderSettings,usePayees} from './providers-view';
import {demoProviderRows} from './demo-providers';
import {manualMoneyRow} from '../../shared/money-records.mjs';
import {anchor} from './data';

export function DemoExpenses({app:a,ui}){
 const {Tabs}=ui,T=a.T,[tab,setTab]=useState('ledger'),[scope,setScope]=useState('family');
 const rows=useMemo(()=>[...demoProviderRows(a.today||anchor),...a.visible(a.data.expenses||[]).map(e=>manualMoneyRow(e,a.text(e)))].filter(t=>scope==='private'?t.visibility==='private':t.visibility!=='private'),[a.data.expenses,a.today,a.lang,a.user,scope]);
 const store=useProviderSettings(a,scope),payees=usePayees(a,rows,scope,store);
 return <>
  <div className="money-controls-row demo-expenses-nav"><div className="money-nav"><Tabs variant="view" value={tab} onChange={setTab} items={[["ledger",T('Ledger','רישום'),null],["recurring",T('Who we pay','למי משלמים'),null,payees.count]]}/></div>
   {tab==='recurring'&&<Tabs variant="filter" value={scope} onChange={setScope} items={[["family",T('Together','ביחד')],["private",T('Just me','רק אני')]]}/>}</div>
  {tab==='ledger'?<ExpensesView app={a} ui={ui}/>:<ProvidersView a={a} ui={ui} summary={payees} store={store} scope={scope}/>}
 </>;
}
