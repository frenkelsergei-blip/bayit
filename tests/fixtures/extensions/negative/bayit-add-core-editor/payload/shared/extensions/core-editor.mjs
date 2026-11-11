// NEGATIVE fixture (tests/fixtures/extensions/negative/bayit-add-core-editor): a statement format that recognises nothing.
export const CORE_EDITOR={
 id:'core-editor',
 name:'Core editor (negative fixture)',
 detect:()=>false,
 parse:()=>({issuer:'core-editor',kind:'bank',account:'',period:{from:'',to:''},transactions:[],checks:[]}),
};
