// "__NAME_EN__" (extension __ID__): a feature module (docs/feature-module-contract.md).
// The feature entry: name, icon, group and the family on/off switch (Settings › Features). Its only route is x/__ID__;
// in the first version it may not map Today widgets, Statistics, Telegram, AI or reminders.
export const __EXPORT___FEATURE={id:'__ID__',group:'home',icon:'SquaresFour',defaultOn:false,
 en:'__NAME_EN__',he:'__NAME_HE__',
 // TODO(bayit): one short sentence in both languages: what the family keeps here.
 description:{en:'TODO: what the family keeps here.',he:'TODO: מה המשפחה שומרת כאן.'},
 routes:['x/__ID__']};
// The module: who may use it and the records it keeps. The core validates every write against these fields and
// refuses anything undeclared; owner, sharing ("Only me" / family / selected people) and edit rules are the core's.
export const __EXPORT___MODULE={
 id:'__ID__',version:1,
 // 'everyone' or 'adults' (an adults-only module is never sent to a child; then set adult:true on the feature too).
 audience:'everyone',childrenMay:'read', // 'write' | 'read' | 'none'
 offline:true, // false keeps it off the device, like money
 collections:{
  items:{edit:'owner',maxRecords:500,label:'title',fields:{
   title:{type:'text',max:200,required:true},
   // TODO(bayit): the fields this screen keeps (text, longtext, number, integer, boolean, date, time, enum, people, ref, tags, object).
   note:{type:'longtext',max:4000},
  }},
 },
};
