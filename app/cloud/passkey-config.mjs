// Passkey switch and relying party, defined with the other sign-in methods in signin-methods.mjs; re-exported here so
// small modules (child-identity.mjs) can ask without naming the registry.
export {passkeysOn,relyingParty,PASSKEY_SIGNIN} from './signin-methods.mjs';
