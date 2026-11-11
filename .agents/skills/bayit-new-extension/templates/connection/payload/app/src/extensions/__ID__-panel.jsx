// Panel for the "__NAME_EN__" connection (extension __ID__). Registered in app/src/extensions/connection-panels.jsx as
// {id, Panel, status?, Icon?}; the card opens Panel with {a, ui, onBusy, onClose, reload}.
// Rules: shared controls and one section anatomy (FormSection, ui.Button; docs/design-system/index.html), real
// Phosphor icons, Hebrew and English through a.T(en, he), RTL, light and night. No one-off styles, no new CSS.
// Never show, store or log a key here: secrets are saved by the server in the encrypted household secrets.
// Today an extension has no server route of its own (that comes with the feature-module seam), so status can use
// only what the app already has.
import React from 'react';
import {PlugsConnected} from '@phosphor-icons/react';
import {FormSection} from '../form-section';

function Panel({a,ui,onClose}){
 const {Button}=ui,T=a.T;
 // TODO(bayit): the panel's real content: what is connected, and the one action the family takes here.
 return <FormSection icon={PlugsConnected} title={T('__NAME_EN__','__NAME_HE__')} T={T}>
  <p>{T('TODO: what this panel shows.','TODO: מה החלון הזה מציג.')}</p>
  <Button secondary onClick={onClose}>{T('Close','סגירה')}</Button>
 </FormSection>;
}

export const __EXPORT___PANEL={
 id:'__ID__',
 Panel,
 Icon:PlugsConnected,
 // TODO(bayit): the honest live state: 'on' | 'off' | 'warn' | 'wait', with a short status in both languages.
 status:({T})=>({state:'off',status:T('Not connected','לא מחובר')}),
};
