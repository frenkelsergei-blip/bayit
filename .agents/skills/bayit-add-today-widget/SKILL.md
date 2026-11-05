---
name: bayit-add-today-widget
description: Add a new widget to Bayit's Today screen (e.g. weather, school schedule, birthdays, pantry low-stock) that respects privacy and the design system. Use when someone asks for something new on the home/Today screen.
---

# Add a Today widget

Read "A new Today widget" in `docs/extending.md`, the rules in `.agents/skills/README.md`, and `AGENTS.md` (design contract).

1. **Agree what it shows.** Agree whose data it uses and who may see it. Children see only what is theirs or shared with them, and never expenses.
2. **Build it in its own file**, `app/src/<name>-widget.jsx` (and `<name>-widget.css` if needed), following `MoneyWidget`/`BillsWidget` in `app/src/money-detail.jsx`:
   - one data request per household
   - a loading skeleton
   - an empty state that invites action
   - a link to the full screen.
3. **Privacy.** Use only server-filtered data or `a.visible(...)`. Never filter private records only in the UI for data the server returned unfiltered.
4. **Register it** in `Today()` in `app/src/App.jsx`, with small exact edits (other contributors edit this file):
   - add a label in `labels`
   - add the key to the switchable list in the customize panel, gated if needed
   - add a render branch.

   Decide whether it's on by default.
5. **Look.**
   - Cream/cobalt/navy/yellow, heavy rounded type, and real PNG or OpenMoji/Phosphor icons (no emoji as art).
   - RTL Hebrew and LTR English, light and night.
   - Phone, tablet and desktop, with no horizontal scroll.
6. **Check.**
   - Run `cd app && npm run test:domain && npm run build:cloud`.
   - Open Today in a browser at desktop and phone widths, in English and Hebrew. Use the demo `?demo=1` and, if possible, a signed-in account.
   - Turn the widget on and off in Customize Today.
