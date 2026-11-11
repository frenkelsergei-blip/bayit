// Tests for the __ID__ extension (a sign-in method). No network, no real client secret.
// tests/signin-methods.test.mjs checks that no method can skip admission or the recent-identity check.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SIGNIN_METHODS,signInMethodProblem,signInProvider,signInChoices} from '../app/cloud/signin-methods.mjs';
import {__EXPORT__} from '../app/cloud/extensions/__ID__.mjs';

const ENV={__ENV___CLIENT_ID:'fixture-id',__ENV___CLIENT_SECRET:'fixture-secret-not-real'};

// Conformance: the sign-in contract.
test('__ID__ is registered after Google, meets the contract, and is offered only when configured',()=>{
 assert.equal(SIGNIN_METHODS[0].id,'google');
 assert.ok(SIGNIN_METHODS.includes(__EXPORT__));
 assert.equal(signInMethodProblem(__EXPORT__),'');
 assert.ok(!signInChoices({}).some(m=>m.id==='__ID__'),'not offered without its secrets');
 assert.ok(signInChoices(ENV).some(m=>m.id==='__ID__'));
});

// Behaviour: fails until provider() and verifiedAccount() are written.
test('__ID__ builds an Auth.js provider with its own id and no unsafe options',()=>{
 let p;try{p=signInProvider(__EXPORT__,ENV)}catch(e){assert.fail('Not written yet: provider() in app/cloud/extensions/__ID__.mjs ('+e.message+')')}
 assert.equal(p.id,'__ID__');
 assert.ok(['oauth','oidc'].includes(p.type),'an OAuth or OpenID provider');
});
// TODO(bayit): make these synthetic profiles look like what the provider really returns.
const VERIFIED={email:'parent@example.test',email_verified:true},UNVERIFIED={email:'someone@example.test',email_verified:false};
test('__ID__ reports an email as verified only when the provider verified it',()=>{
 let a,b;try{a=__EXPORT__.verifiedAccount({profile:VERIFIED,account:{},user:{}});b=__EXPORT__.verifiedAccount({profile:UNVERIFIED,account:{},user:{}})}
 catch(e){assert.fail('Not written yet: verifiedAccount() in app/cloud/extensions/__ID__.mjs ('+e.message+')')}
 assert.deepEqual([a.email,a.email_verified],['parent@example.test',true]);
 assert.notEqual(b.email_verified,true);
});
