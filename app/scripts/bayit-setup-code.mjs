// Prints a fresh one-time code for passkeys (docs/passkey-sign-in-design.md §2.3, §4.3): 20 Crockford base32
// characters, about 100 bits. The installation owner runs this in their OWN terminal and pastes the code into
//   npx wrangler pages secret put BAYIT_SETUP_CODE --project-name <project>      (first owner, Cloudflare)
//   npx wrangler pages secret put BAYIT_RECOVERY_CODE --project-name <project>   (operator recovery, Cloudflare)
// then keeps it somewhere private until it is used. An agent never runs this for them or reads the output.
// Docker makes its own setup code at first start (data/setup-code.txt) and recovery codes with recovery-cli.mjs.
import {makeCode} from '../cloud/passkeys.mjs';
console.log(makeCode());
