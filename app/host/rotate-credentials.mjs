import {openD1} from './d1-sqlite.mjs';
import {rotateStoredCredentials} from '../cloud/credential-rotation.mjs';
// Offline wrapper for Docker. The same rotation engine also runs against installation-owned D1.
export async function rotateCredentials(data,env,{stopped=false}={}){
 if(!stopped)throw Error('Stop the household server before rotating credentials and pass --stopped.');const DB=openD1(data+'/bayit.sqlite');try{const result=await rotateStoredCredentials({...env,DB});if(!result.complete)throw Error('Credential storage changed during offline rotation. Keep every original key and inspect the backup.');return result}finally{DB.close()}
}
