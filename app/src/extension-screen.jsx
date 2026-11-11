// Feature modules on the client (work package 2.5, docs/feature-module-contract.md).
// One generic route for every installed module, #x/<id>[/<view>], mounted by a single branch in App.jsx subview().
// The module's screen is loaded lazily (its own chunk, precached for offline by the service worker), runs inside an
// error boundary, and receives only what any page receives: the app object (already filtered for this member by
// the server) and the shared design-system kit. It reads and writes ONLY its own records through `records`, `save`
// and `remove`; the server checks every change (shared/feature-modules.mjs).
// No new styling: the unavailable / could-not-open states reuse the Feature-off page layout.
import React,{lazy,Suspense} from 'react';
import {EXTRA_SCREENS} from './extensions/screens.jsx';
import {moduleById,newModuleRecord} from '../../shared/feature-modules.mjs';
import {featureLabel} from '../../shared/features.mjs';
import {extKey,recordList,putRecord,dropRecord} from '../../shared/record-paths.mjs';
import {FeatureIcon} from './feature-icons';
import './feature-off.css';

const loaded=new Map();
const screenFor=entry=>{if(!loaded.has(entry.id))loaded.set(entry.id,lazy(()=>Promise.resolve(entry.load()).then(m=>({default:m.default||m.Screen}))));return loaded.get(entry.id)};
export const screenEntry=id=>EXTRA_SCREENS.find(s=>s.id===id)||null;

// The records API a module screen gets. records(c): this member's visible records of collection c (the server has
// already removed what they may not see; `visible` adds the feature and list rules every page uses).
export function moduleApi(app,module){
 const key=c=>{if(!module.collections[c])throw Error('Unknown '+module.id+' list: '+c);return extKey(module.id,c)};
 return {
  records:c=>{const list=recordList(app.data,key(c));return Array.isArray(list)?(app.visible?app.visible(list):list).filter(r=>!r.deletedAt):[]},
  create:(c,fields)=>({...newModuleRecord(fields,{actorId:app.user})}),
  save:(c,record)=>app.update(d=>{putRecord(d,key(c),{...record,updatedAt:new Date().toISOString(),updatedBy:app.user})}),
  remove:(c,id)=>app.update(d=>{dropRecord(d,key(c),id)}),
 };
}

// Menu entries for installed modules, in the shape App.jsx `places` uses: [route, Icon, label]. Concept A chosen by
// the user 2026-11-10: a module is a place like any other (in "More", pinnable to the quick menu).
// routeOn filters what is off, hidden by this person or adults-only.
export function extensionPlaces(routeOn,lang){
 return EXTRA_SCREENS.filter(s=>moduleById(s.id)&&routeOn('x/'+s.id)).map(s=>['x/'+s.id,s.Icon||(p=>React.createElement(FeatureIcon,{id:s.id,...p})),featureLabel(s.id,lang)]);
}

function Calm({a,id,title,text}){
 return <section className="feature-off" aria-labelledby="extension-screen-title">
  <span className="feature-off-icon" aria-hidden="true"><FeatureIcon id={id} size={44}/></span>
  <h1 id="extension-screen-title">{title}</h1><p>{text}</p>
  <div className="feature-off-actions"><button type="button" className="button secondary" onClick={()=>a.go('today')}>{a.T('Back to Today','חזרה למסך היום')}</button></div>
 </section>;
}
class Boundary extends React.Component{
 constructor(p){super(p);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error){try{console.error('Bayit extension "'+this.props.id+'" failed:',error)}catch{}}
 render(){const {a,id}=this.props;return this.state.failed?<Calm a={a} id={id} title={a.T('This extension could not open','לא הצלחנו לפתוח את ההרחבה')} text={a.T('The rest of Bayit works as usual. Nothing was changed.','כל השאר בבית עובד כרגיל. שום דבר לא השתנה.')}/>:this.props.children}
}

export function ExtensionScreen({app:a,ui,id,view}){
 const entry=screenEntry(id),module=moduleById(id);
 if(!entry||!module)return <Calm a={a} id={id} title={a.T('This page isn’t available','העמוד הזה לא זמין')} text={a.T('It may belong to an extension that is not installed. Nothing was deleted.','ייתכן שהוא שייך להרחבה שלא מותקנת. שום דבר לא נמחק.')}/>;
 const Screen=screenFor(entry),api=moduleApi(a,module);
 return <Boundary key={id} a={a} id={id}><Suspense fallback={<p role="status">{a.T('Opening…','פותחים…')}</p>}><Screen app={a} ui={ui} module={module} view={view||''} {...api}/></Suspense></Boundary>;
}
