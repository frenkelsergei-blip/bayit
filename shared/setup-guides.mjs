// Step-by-step connection guides shown in first-run setup (user request 2026-11-09). The text follows
// .claude/skills/bayit-connect and the public docs; status is always read live, never assumed.
// Since Modular Bayit 1.2 (2026-11-10) each guide lives with its connection in shared/connections.mjs;
// this keeps first-run setup's view of them, keyed as setup knows them (hosting, family, ai, telegram, riseup, maps…).
// A step action is {link:url} for an outside page, or {card:id} to open that card in Settings › Accounts & connections.
import {connectionGuides} from './connections.mjs';
export const SETUP_GUIDES=connectionGuides();
