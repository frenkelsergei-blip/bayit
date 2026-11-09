// Selection is a UI context; record authorization still runs before filtering.
export function kidsContext(members,actorId,preferred){
 const actor=members.find(m=>m.id===actorId),children=members.filter(m=>m.role==='child'&&(actor?.role!=='child'||m.id===actorId));
 return {children,child:children.some(m=>m.id===preferred)?preferred:children[0]?.id};
}
export const routinesForChild=(records,childId)=>records.filter(t=>t.routine&&t.memberId===childId);
