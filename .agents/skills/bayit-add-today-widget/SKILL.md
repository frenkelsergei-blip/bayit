---
name: bayit-add-today-widget
description: Add a new widget to Bayit's Today screen (e.g. weather, school schedule, birthdays, pantry low-stock) that respects privacy and the design system. Use when someone asks for something new on the home/Today screen.
---

# Add a Today widget

This is meant to be a **generator** skill (`docs/extension-skills.md`) like `bayit-add-ai-provider`. It cannot be one yet: **Bayit has no local registry for Today widgets.** The widget list, labels and rendering live in `Today()` in `app/src/App.jsx`, so a widget today means changing a core screen, which an update can conflict with. `docs/extension-skills.md` ("Seams still missing") describes the seam that is proposed.

## Tell the person first

Say plainly: "A new Today widget still needs a change to Bayit's own code. It will work, but updating Bayit may conflict with it, and it cannot be removed with one command." Then offer:

1. **Wait for the Today widget seam** (recommended). Note what they want; nothing is changed.
2. **Contribute it to Bayit** for every family, following the steps below in a fork, as a pull request.
3. **Change their own copy anyway**, following the steps below, knowing that `bayit-update` may stop on it. Do not record it in `shared/extensions/installed.json`: it is not an extension.

## Agree what it shows

Agree whose data it uses and who may see it. Children see only what is theirs or shared with them, and never expenses.

## Steps (options 2 and 3)

Read `AGENTS.md` (design contract) and the rules in `.agents/skills/README.md`.

1. **Build it in its own file**, `app/src/<name>-widget.jsx` (and `<name>-widget.css` if needed), following `MoneyWidget`/`BillsWidget` in `app/src/money-detail.jsx`: one data request per household, a loading skeleton, an empty state that invites action, and a link to the full screen.
2. **Privacy.** Use only server-filtered data or `a.visible(...)`. Never filter private records only in the UI for data the server returned unfiltered.
3. **Own it in a feature.** Every widget belongs to exactly one feature (`shared/features.mjs`, `widgets`); `tests/features.test.mjs` fails otherwise.
4. **Register it** in `Today()` in `app/src/App.jsx`, with small exact edits (other contributors edit this file): a label in `labels`, the key in the switchable list of the customize panel (gated if needed), and a render branch. Decide whether it is on by default.
5. **Look.** Cream/cobalt/navy/yellow, heavy rounded type, real PNG or OpenMoji/Phosphor icons (no emoji as art); RTL Hebrew and LTR English, light and night; phone, tablet and desktop with no horizontal scroll. Check `docs/design-system/index.html` and update it in the same change.
6. **Check.** Run `cd app && npm run test:domain && npm run build:cloud`. Open Today at desktop and phone widths, in English and Hebrew, with `?demo=1` and, if possible, a signed-in account. Turn the widget on and off in Customize Today.

## Once the seam exists

This skill becomes a generator with a `template/` package: a feature entry in `shared/extensions/features.mjs` that owns the widget id, a widget component in `app/src/extensions/<id>-widget.jsx` registered in the proposed `app/src/extensions/today-widgets.jsx`, and tests. `REMOVE.md` then becomes `bayit-extension.mjs remove <id>`.
