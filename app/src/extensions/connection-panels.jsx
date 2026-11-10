// Local registry: connection panels added by installed extensions (docs/extensions-registry.md).
// Upstream Bayit ships this list empty and never edits this file, so updates never conflict with your extensions.
// An entry is {id, Panel, status?, Icon?}: id matches the extension's entry in shared/extensions/connections.mjs;
// Panel is the component its card opens ({a, ui, onBusy, onClose, reload}); status(context) returns
// {state:'on'|'off'|'warn'|'wait', status, detail} from live data (without it the card says "Status unavailable").
export const EXTRA_CONNECTION_PANELS=[];
