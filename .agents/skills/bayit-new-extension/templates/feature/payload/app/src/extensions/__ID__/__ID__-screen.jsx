// "__NAME_EN__" screen. Props: app (this member's copy, a.T for Hebrew/English), ui (the shared design-system kit:
// Heading, Button, Empty, RecordAccess, PersonChip, …), module, view, and the records API:
// records('items'), create('items', fields) (a new "Only me" record), save('items', record), remove('items', id).
// Rules: only shared controls from `ui`, no one-off styles, real Phosphor icons, Hebrew and English, RTL, light and night.
import React from 'react';

export default function Screen({app:a,ui,records}){
 const {Heading,Empty}=ui,T=a.T,items=records('items');
 // TODO(bayit): the screen: the list of records and the one action the family takes here.
 return <section>
  <Heading title={T('__NAME_EN__','__NAME_HE__')}/>
  {items.length?<ul>{items.map(r=><li key={r.id}>{r.title}</li>)}</ul>:<Empty text={T('TODO: nothing here yet.','TODO: עדיין אין כאן כלום.')}/>}
 </section>;
}
