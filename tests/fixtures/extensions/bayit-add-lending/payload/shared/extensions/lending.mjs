// "Lent & borrowed" (extension lending): a test fixture for the feature-module seam (docs/feature-module-contract.md).
// The feature entry gives the name, icon, group and the family on/off switch; the module declares the records.
export const LENDING_FEATURE={id:'lending',group:'home',icon:'HandArrowUp',defaultOn:false,
 en:'Lent & borrowed',he:'השאלות',description:{en:'What we lent or borrowed, and from whom.',he:'מה השאלנו או שאלנו, וממי.'},
 routes:['x/lending']};
export const LENDING_MODULE={
 id:'lending',version:1,audience:'everyone',childrenMay:'read',offline:true,
 collections:{
  items:{edit:'owner',maxRecords:500,label:'title',fields:{
   title:{type:'text',max:200,required:true},
   direction:{type:'enum',values:['lent','borrowed']},
   person:{type:'text',max:120},
   lentOn:{type:'date'},dueOn:{type:'date'},
   returned:{type:'boolean'},
   note:{type:'longtext',max:4000},
  }},
 },
 maxBytes:150000,
};
