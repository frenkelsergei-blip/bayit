# Remove a Today widget

Until Bayit has a Today widget seam, a widget added with this skill is a change to core files, not an extension, so there is no one-command removal. Reverse every step by hand:

1. Delete `app/src/<name>-widget.jsx` (and `<name>-widget.css`).
2. In `Today()` in `app/src/App.jsx`, remove its label, its key in the customize panel's list and its render branch.
3. Remove the widget id from its feature's `widgets` in `shared/features.mjs` (or the feature, if it was added only for this widget).
4. Run `cd app && npm run test:domain && npm run build:cloud`.

Before step 2, ask the people who placed the widget to turn it off in Customize Today: a key Bayit no longer knows stays in their saved Today order and can leave an empty card.
