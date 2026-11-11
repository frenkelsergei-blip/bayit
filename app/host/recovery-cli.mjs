// Operator recovery for Docker (docs/passkey-sign-in-design.md §4.3): when the only parent lost every passkey.
//   docker exec bayit node recovery-cli.mjs --data /data
// Prints a one-time code. On the sign-in screen choose "I own this installation and can't sign in", enter it, pick the
// parent account and create a new passkey. The code works once; running this again replaces an unused one.
import {parseArgs} from 'node:util';
import {newRecoveryCode} from './setup-code.mjs';
try{
 const {values}=parseArgs({options:{data:{type:'string'}}});const data=values.data||process.env.DATA_DIR;
 if(!data)throw Object.assign(Error('Use --data DIR (the folder that holds secrets.json and bayit.sqlite).'),{status:1});
 const code=await newRecoveryCode(data);
 console.log('One-time recovery code: '+code+'\nOpen your Bayit address, choose "I own this installation and can’t sign in" and enter it. It works once.');
}catch(e){console.error(e.status?e.message:'No recovery code was made. Check that --data points at the Bayit data folder.');process.exitCode=1}
