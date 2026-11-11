// Connection "__NAME_EN__" (extension __ID__): its row in Settings › Accounts & connections and its setup guide.
// The full entry shape is the comment at the top of shared/connections.mjs; connectionProblem() checks it.
// The row appears only with its panel (app/src/extensions/__ID__-panel.jsx), registered in the same extension.
// Plain words: "קוד חיבור" for a key or token in step titles; the technical term only where something is copied.
export const __EXPORT__={
 id:'__ID__',
 group:'more', // optional connections live in "More connections" and are never counted in the To start bar
 optional:true,
 manage:'household', // TODO(bayit): 'household' (a parent sets it up once) or 'person' (each person connects their own)
 icon:'PlugsConnected',tone:'soft',
 name:{en:'__NAME_EN__',he:'__NAME_HE__'},
 // TODO(bayit): the row's one plain line: what it brings to the family.
 description:{en:'TODO: what __NAME_EN__ brings to the family, in one line.',he:'TODO: מה __NAME_HE__ מביא למשפחה, בשורה אחת.'},
 guide:{icon:'PlugsConnected',en:'Connect __NAME_EN__',he:'חיבור __NAME_HE__',
  // TODO(bayit): why connect it, honestly, and what it needs (time, cost, account).
  why:{en:'TODO: optional. Why a family would connect __NAME_EN__.',he:'TODO: אופציונלי. למה כדאי לחבר את __NAME_HE__.'},
  need:[['Clock',{en:'About 5 minutes',he:'בערך 5 דקות'}],['User',{en:'An account at __NAME_EN__',he:'חשבון ב־__NAME_HE__'}]],
  steps:[
   // TODO(bayit): the real steps. An outside page is {link:'https://…'}; the last step opens this card's own panel.
   [{en:'Open __NAME_EN__',he:'פתחו את __NAME_HE__'},{en:'TODO: what to do there.',he:'TODO: מה עושים שם.'},{link:'https://__ID__.invalid/',en:'Open __NAME_EN__',he:'ל־__NAME_HE__'}],
   [{en:'Finish in Bayit',he:'מסיימים בבַּיִת'},{en:'TODO: what to do in the panel.',he:'TODO: מה עושים בחלון.'},{card:'__ID__',en:'Open __NAME_EN__',he:'ל־__NAME_HE__'}],
  ]},
};
