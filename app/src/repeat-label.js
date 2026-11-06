export function repeatLabel(repeat,T){
 const labels={once:['Once','פעם אחת'],daily:['Every day','כל יום'],weekly:['Every week','כל שבוע'],monthly:['Every month','כל חודש'],yearly:['Every year','כל שנה']};
 return T(...(labels[String(repeat||'once').toLowerCase()]||labels.once));
}
