// Client helpers for the features registry (shared/features.mjs, 2026-11-09). `a` is the app context.
import {widgetFeature,recordOn,featureOn} from '../../shared/features.mjs';
export const widgetOn=(a,key)=>{const f=widgetFeature(key);return !f||!a.features||a.features.on(f)};
// Records that belong to a feature that is off (e.g. kids' routines, maintenance tasks) are left out of every list.
export const recordVisible=(ctx,record,actorId,collection)=>!ctx||recordOn(ctx,collection||(record&&(record.routine||record.category==='maintenance')?'tasks':''),record,actorId);
export {featureOn};
