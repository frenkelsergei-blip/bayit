// Sign-in method "__NAME_EN__" (extension __ID__). Contract: docs/sign-in-methods.md and the comment at the top of
// app/cloud/signin-methods.mjs. A method only proves identity. Admission (who may join), sessions, the "confirm it's
// you" window and rate limits stay in core and cannot be changed here; any extra field is refused.
// The owner sets __ENV___CLIENT_ID and __ENV___CLIENT_SECRET as installation secrets (never in a file or chat).
// SECURITY: a sign-in method decides who gets into a family's data. Have it reviewed before a family uses it.
// TODO(bayit): import the Auth.js provider, for example:  import GitHub from '@auth/core/providers/github';
//   Prefer an id equal to the Auth.js provider's own id ('github'), so its callback is /api/auth/callback/<id>.
//   If the provider package is not in app/package.json yet, add it to extension.json "dependencies" at an exact version.

export const __EXPORT__={
 id:'__ID__',
 label:{en:'Continue with __NAME_EN__',he:'המשך עם __NAME_HE__'},
 start:'authjs',
 configured:env=>!!(env.__ENV___CLIENT_ID&&env.__ENV___CLIENT_SECRET),
 // TODO(bayit): return the provider, e.g. GitHub({clientId:env.__ENV___CLIENT_ID,clientSecret:env.__ENV___CLIENT_SECRET,checks:['pkce','state']}).
 //   Never a 'credentials' provider, never allowDangerousEmailAccountLinking.
 provider:env=>{throw Error('The __NAME_EN__ sign-in method is not written yet.')},
 // TODO(bayit): return {email, email_verified} from what the provider returned. email_verified is true ONLY when the
 //   provider itself verified that address (read its docs; some need a separate call or a "verified" flag).
 verifiedAccount:({profile,account,user})=>{throw Error('The __NAME_EN__ sign-in method is not written yet.')},
 recentIdentity:'sign-in-again',
};
