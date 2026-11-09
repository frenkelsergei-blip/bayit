import React from 'react';
import {Plant,ArrowRight} from '@phosphor-icons/react';
import {gardenArt} from '../../shared/hero-garden.mjs';

export function GrowthStages({a,crop,stage=0,preview=false}){
 const labels=[['Planting','שתילה'],['Sprout','נבט'],['Growing','צמח צעיר'],['Harvest','מוכן לקטיף']];
 return <figure className="garden-growth-preview"><figcaption><Plant size={17}/><strong>{a.T('How it grows','תהליך הצמיחה')}</strong></figcaption><p>{a.T('A preview of how this plant changes over time.','כך הצמח משתנה לאורך הזמן.')}</p><ol className="garden-stages" aria-label={a.T('Four growth stages','ארבעה שלבי צמיחה')}>{[1,2,3,4].map(n=><li key={n} className={n===stage?'is-current':''} aria-current={n===stage?'step':undefined}><img src={gardenArt(crop,n)} alt=""/><span>{a.T(...labels[n-1])}</span>{n===stage&&<small>{preview?a.T('Starting here','מתחילים כאן'):a.T('Current stage','השלב הנוכחי')}</small>}{n<4&&<ArrowRight className="garden-growth-arrow" size={16} aria-hidden="true"/>}</li>)}</ol></figure>;
}
