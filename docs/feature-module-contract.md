# Feature-module contract (v1)

Work package 2.5 of `docs/modular-bayit-plan.md`. Design and the user's answers: `docs/feature-module-design.md` (answered 2026-11-10, "לפי ההמלצה שלך"). Implemented 2026-11-10.

A **feature module** is an extension that adds a whole screen with the family's own records ("Lent & borrowed", "Chore swap", "Board-game nights"). The module only **declares** what it keeps; the core applies every privacy and permission rule. A module that passes `tests/feature-module-conformance.mjs` keeps Bayit's rules without the core knowing its fields.

## What a module is

Three registry lines with the same id (lowercase letters, digits, `-`), applied by `node app/scripts/bayit-extension.mjs apply <package>` with `"seam": "modules"` and `"outbound": []`:

| Registry | Local file (ships empty) | Entry |
|---|---|---|
| `features` | `shared/extensions/features.mjs` → `EXTRA_FEATURES` | name, icon, group, `defaultOn`, bilingual description, `routes:['x/<id>']`, `adult:true` when adults only. No `widgets`, `stats`, `telegram`, `aiTools`, `aiActions`, `aiSources`, `reminders`, `notificationCategories` in v1. |
| `modules` | `shared/extensions/modules.mjs` → `EXTRA_MODULES` | the manifest below |
| `screens` | `app/src/extensions/screens.jsx` → `EXTRA_SCREENS` | `{id, Icon, load:()=>import('./<id>/<id>-screen.jsx')}` |

Scaffold one with `node app/scripts/bayit-new-extension.mjs feature <id> --name "…" --he "…"`. A test-only example lives in `tests/fixtures/extensions/bayit-add-lending/` and is never registered in the shipped files.

### Manifest

```js
{id:'lending', version:1,
 audience:'everyone',        // 'everyone' | 'adults' (then the feature must be adult:true)
 childrenMay:'read',         // 'write' | 'read' | 'none' (only for 'everyone')
 offline:true,               // false: never stored on a device, page needs the connection
 collections:{items:{
  edit:'owner',              // 'owner' | 'policy' (editPolicy/editorIds, like Home journal notes)
  maxRecords:500,            // ≤ 2 000
  label:'title',             // a text field: what lists, conflicts and exports show
  fields:{title:{type:'text',max:200,required:true}, returned:{type:'boolean'}, …},
  check:(value,{old,actorId,role})=>'',   // optional, refuse-only, runs after every core check
 }},
 maxBytes:150000}            // whole module, ≤ 300 000
```

Field types: `text` (≤ 2 000, default 300), `longtext` (≤ 20 000), `number`, `integer` (`min`/`max`), `boolean`, `date` (`YYYY-MM-DD`), `time` (`HH:MM`), `enum` (`values`), `people` (member ids), `ref` (`to`: a collection of the same module; must exist and be visible to the writer), `tags`, `object` (declared sub-fields, one level). The core owns `id`, `ownerId`, `visibility`, `allowedIds`, `editPolicy`/`editorIds` (only with `edit:'policy'`), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`, `icon`. Anything undeclared, a key starting with `$` or containing `.`, an id that is not `[A-Za-z0-9_-]{1,140}`, a record over 20 KB, a full list or a module over its byte limit is refused. Any manifest key from a later version (`outbound`, `today`, `widgets`, `reminders`, `telegram`, `statistics`, `ai`, `secrets`, `files`, `tables`, `routes`, `upgrade`, …) and `assignees:true` are refused when the registry loads, so the app and the tests fail to start instead of quietly ignoring them.

## Storage and sync (both hosts)

- Records live in the household document: `state.extensions[<id>][<collection>]` in `household_data` (one row per `household_id`, the same table on Cloudflare D1 and on the Docker host's SQLite). **No new table or migration**: this is the design's option B, chosen because it reuses the existing write path whole: idempotent `clientOpId`, `baseRevision`, revision-checked `UPDATE`, three-way merge, offline queue and audit.
- Change ops use the key `ext:<id>/<collection>` and go through `POST /api/households/<id>/changes` like every other record. Helpers: `shared/record-paths.mjs`.
- Offline: module records are in the member's device copy unless `offline:false`; queued edits replay and conflicts behave like core records (`shared/offline-sync.mjs`, `shared/change-merge.mjs`): a different field merges, the same field or any sharing change is `EDIT_CONFLICT` with "Use mine".
- The household's 1.6 MB document limit still applies; each module also has its own cap.

## Privacy rules the core enforces

- **Owner and sharing**: every record is private ("Only me"), family or selected people, exactly as core records. Only the owner deletes or changes sharing; a record a member cannot see cannot be touched. New records from the screen start as "Only me".
- **Edit**: `owner` only, or `policy` with the same rule as notes (parents get no automatic right on someone else's record).
- **Children**: an `adults` module is never sent to a child and refuses a child's writes, the Expenses rule (`visibleState`, `applyChanges`, `featureOn` with `adult:true`). `everyone` + `childrenMay:'none'` behaves the same; `'read'` sends family/selected records but refuses writes; `'write'` lets a child add their own records.
- **Server copy built from scratch**: `visibleState` drops whatever is stored under `extensions` and rebuilds it only for installed modules, declared collections and declared fields, filtered by `canSeeRecord` for this member. Someone outside the household gets nothing (and the worker refuses them before that).
- **Family switch**: parents turn a module off for everyone in Settings › Features (it is a feature like any other). Off: the route shows the usual "turned off" page, delivery drops it, writes are refused, nothing is deleted. Each person can also hide it for themselves.
- **Nothing else reads it in v1**: Bayit AI, reminders, Push, Telegram, Statistics, change notices, pins and suggestions never see module data (`deliveryView` drops modules that are off; the conformance suite also checks those server files never read `extensions`). Export (Settings › General › download my data) includes the member's own visible copy.

## Removal, reinstall, download, delete (answer 1)

- `bayit-extension.mjs remove <id>` deletes the code and registry lines only. The stored slice stays in `household_data` byte for byte; it is not served and cannot be written. Applying the package again serves it again.
- Parents list stored slices: `GET /api/households/<id>/extensions` → `{kept:[{id, installed, bytes, name, privateOthers}]}` (`name`: the module's English and Hebrew display names, kept with its data on every write as `$name` beside the record lists and never sent to devices, so a removed extension is still shown by name; `null` when no name was ever saved, and the screen then shows the id. `privateOthers`: how many other people have records there this parent cannot see; a count, never names). The Storage row shows the name only, no size.
- Download: `GET /api/households/<id>/extensions/<module>/export` → the records of that module the member may see (also after removal; then a child gets nothing).
- Delete on purpose: `POST /api/households/<id>/extensions/<module>/delete` with `{"confirm":"<module>","baseRevision":n}`. Parents only, Google sign-in on this session within the recent window (`requireRecent`), revision-checked, audited as `state.change` on `ext:<module>`. Never automatic.

## The client

- One generic route, `#x/<id>[/<view>]`, mounted by one branch in `App.jsx` `subview()` → `ExtensionScreen` (`app/src/extension-screen.jsx`). The screen is loaded lazily (own chunk, precached for offline), wrapped in an error boundary ("This extension could not open; the rest of Bayit works"), and receives:
  - `app` (this member's copy, `a.T(en, he)`, `a.lang`, `a.user`, `a.go`, …), `ui` (the same kit My space gets plus `RecordAccess` and `PersonChip`: `Heading, Button, Badge, Tabs, Avatar, Icon, Week, Checkbox, DetailPanel, CalendarView, Select, Scope, MonthCalendar, Empty, RecordAccess, PersonChip`), `module`, `view`;
  - `records(c)`, `create(c, fields)`, `save(c, record)`, `remove(c, id)`. Writes go through `app.update` and the normal sync.
- Design rules: shared controls from `ui` only, no one-off styles, real Phosphor icons, Hebrew and English, RTL, light and night. Its own CSS, if any, in its own stylesheet.
- The feature icon comes from the screen entry (`FeatureIcon` looks there first).
- **Chosen by the user 2026-11-10** (`concept/explorations/feature-modules-20261110/`): a module is a place like any other (`extensionPlaces()` in `App.jsx` `places`): in "More", pinnable in Settings › General › Quick menu, hidden when off, hidden for that person, or adults-only for a child. Its family switch is its row in Settings › Features. Data kept from a removed extension appears to parents in Accounts & connections › Where the data lives (`app/src/kept-extension-data.jsx`): Download copy, then Delete…, with a warning naming how many other people kept private records in it (a count only).

## Conformance

`runModuleConformance(id)` from `tests/feature-module-conformance.mjs`. `tests/feature-modules.test.mjs` runs it on every installed module and drives the fixture end to end through the real server on SQLite; each module's package test runs it on itself during `apply`. It checks the manifest and v1 limits, schema acceptance and refusals, the access matrix (parent, selected adult, other adult, child, outsider), no leak paths, feature off and on, offline and merge, removal/kept data/download/delete, and that the screen loads lazily and renders in Hebrew and English.

## Not in v1 (each needs the user's approval)

Assignees (`memberIds` as people who always see), Today card (next), reminders, Push, Telegram, Statistics, Bayit AI read access, outside services (declared origins), secrets, files, own tables/migrations, server routes, data upgrades (`version` > 1), pins, search, change notices, the general allow-list hardening of every top-level key in `visibleState` (only `extensions` is rebuilt from scratch today).
