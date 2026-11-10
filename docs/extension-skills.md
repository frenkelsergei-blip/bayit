# Extension skills: the package format

Bayit grows the way NanoClaw does: **don't add features, add skills.** A new capability (an AI provider, a bank statement format, a sign-in method, a speech provider, a connection, a whole feature) is an **extension**: new files plus one line in a local registry file (`docs/extensions-registry.md`). It is delivered as an agent skill that a person's agent applies to their own copy of Bayit.

This document is the format. `app/scripts/bayit-extension.mjs` implements it, and `tests/extension-skills.test.mjs` checks that the two agree.

## Two kinds of skill

| Kind | What it holds | Examples |
|---|---|---|
| **Operational** | Instructions only. It configures, checks or updates a copy and never adds code. | `bayit-install-cloudflare`, `bayit-install-docker`, `bayit-check`, `bayit-update`, `bayit-connect`, `bayit-localize`, `bayit-release` |
| **Extension** | A package with a payload that adds one capability. | `bayit-add-<name>` |

An extension skill is either:

- **fixed**: the skill folder *is* the package. Applying it always adds the same thing (for example "Discount Bank statements").
- **a generator**: it teaches an agent to write a *new* package for a choice the person makes (which AI provider, which bank). It keeps a working `template/` package. Its output is itself a fixed package, written to `local-extensions/<id>/` and applied like any other. `bayit-add-ai-provider` and `bayit-add-statement-format` are generators.

## The package

```
.agents/skills/bayit-add-<name>/      (or local-extensions/<id>/ for a package a generator wrote)
  SKILL.md         what it adds, what to ask the person first, apply, verify, Troubleshooting
  REMOVE.md        reverses everything apply leaves behind
  extension.json   the manifest: everything the script is allowed to do
  payload/         the code, at its final relative paths (payload/shared/extensions/<id>.mjs → shared/extensions/<id>.mjs)
  tests/           its tests, copied to the same path (tests/extension-<id>.test.mjs → tests/extension-<id>.test.mjs)
```

A generator skill has `SKILL.md`, `REMOVE.md` and `template/`, where `template/` is a complete package with a placeholder id (`my-ai`, `my-bank`).

### SKILL.md

Under 500 lines, with front matter `name` and `description` (for a published skill). Sections:

1. **What it adds**: in the family's words, and which outside addresses it calls.
2. **Ask first**: keys, accounts, choices. Only what needs a person.
3. **Apply**: one command, `node app/scripts/bayit-extension.mjs apply <package-folder>`. The agent never copies files or edits registry files by hand: the script does it the same way every time.
4. **Verify**: `node app/scripts/bayit-extension.mjs check`, then `cd app && npm run test:domain && npm run build:cloud`, then what a person checks in the app.
5. **Troubleshooting**: required when there is a key, an account or any interactive step.

### REMOVE.md

Usually `node app/scripts/bayit-extension.mjs remove <id>`, plus anything outside the copy a person should undo (a key saved in the app, an account at the provider). It says what happens to data the extension created: Bayit never deletes family data on removal.

### extension.json

```json
{
 "id": "example-bank",
 "version": "1.0.0",
 "name": {"en": "Example Bank statements", "he": "דפי חשבון של בנק לדוגמה"},
 "description": "One sentence.",
 "seam": "statement-formats",
 "minBayit": "1.56.0",
 "files": ["shared/extensions/example-bank.mjs", "tests/extension-example-bank.test.mjs"],
 "registry": [
  {"seam": "statement-formats", "id": "example-bank", "file": "shared/extensions/example-bank.mjs", "export": "EXAMPLE_BANK"}
 ],
 "outbound": [],
 "dependencies": {}
}
```

| Field | Rule |
|---|---|
| `id` | 2–40 lowercase letters, digits or `-`, starting with a letter. Unique among installed extensions. |
| `version` | `major.minor.patch`. |
| `name` | English and Hebrew. |
| `seam` | The main seam: `features`, `ai-providers`, `speech`, `signin`, `statement-formats` or `connections`. At least one registry line uses it. |
| `minBayit` | The oldest Bayit version (`app/package.json`) it works with. |
| `files` | Every file it adds, and nothing else. See "Where files may go". |
| `registry` | The registry lines it adds: the seam, the entry's `id` in that registry, the file that exports the entry, and the export's name. An extension may touch several seams (a feature plus its connection). |
| `outbound` | Every outside address it calls, as exact `https://` origins, so the installation's outbound policy can allow exactly those. |
| `dependencies` | npm packages it needs, pinned to exact versions (`"1.2.3"`, never `^1.2.3`). |

### Where files may go

Files are named after the extension, so two extensions never collide:

- `shared/extensions/`, `app/cloud/extensions/`, `app/src/extensions/`: `<id>.<ext>`, `<id>-<name>`, or anything inside `<id>/`;
- `tests/extension-<id>.test.mjs` and `tests/extension-<id>-<name>.test.mjs` (they run with `npm run test:domain`);
- `tests/fixtures/extension-<id>/…` for synthetic test data.

Never a core file, never a local registry file (apply edits those line by line), never `installed.json`. The script refuses `..`, absolute paths, files in `payload/` or `tests/` that `files` does not list, links inside the package, and any path that leads out of the copy through a linked folder.

## What every extension must meet

From the modular entry in `AGENTS.md`. Review a package against these before applying it; the script can check only the last two.

1. Owner and visibility are enforced on the server (`visibleState`, `canSee`), never only in the UI.
2. Secrets live only in the encrypted household secrets: never in files, logs, chat or `extension.json`.
3. Hebrew and English text; works in RTL, light and night, on phone, tablet and desktop.
4. Uses the design system (`docs/design-system/index.html`): shared controls, real icons, no one-off styles.
5. Declares every outside address it calls (`outbound`).
6. Tests use synthetic data only: no real statements, names, account numbers or keys.

## What the script does

```bash
node app/scripts/bayit-extension.mjs apply <package-folder> [--update] [--no-tests]
node app/scripts/bayit-extension.mjs remove <id> [--force]
node app/scripts/bayit-extension.mjs check
```

`--root <folder>` works on another copy (the tests use it on temporary copies).

**apply** reads and validates `extension.json`, then:

1. refuses if the id is installed (use `--update`), if this Bayit is older than `minBayit`, or if a dependency is not already in `app/package.json` at that exact version. It prints the `npm install --save-exact …` command; the person agrees to running it, because it downloads code.
2. refuses to overwrite any existing file, or a file another extension owns;
3. copies the files and adds one line per registry entry to the local registry file, above its list, and the entry to the list:
   ```js
   import {EXAMPLE_BANK as ext_example_bank} from './example-bank.mjs'; // bayit-extension: example-bank
   export const EXTRA_STATEMENT_FORMATS=[ext_example_bank];
   ```
   The name is always `ext_<id>` (`ext_<id>_1`, … for further lines), so two extensions never clash on a name;
4. records the install in `shared/extensions/installed.json`;
5. loads the touched core registries in a fresh Node (each entry passes the same checks as core entries), runs bayit-doctor's extension report, and runs the package's own tests (`--no-tests` skips them);
6. if anything fails, **rolls back**: every file it wrote or edited is restored, every folder it created is removed. A copy is either fully applied or exactly as it was.

**remove** deletes the recorded files and the folders they leave empty, removes the lines marked `// bayit-extension: <id>` and their names from the list, removes the record, and loads the registries again. After remove the copy is byte for byte what it was before apply. It stops when a file changed since apply (keep a copy of the change, then `--force`), and it rolls back when the copy would no longer load without the extension (another extension depends on it).

**check** lists what is installed and reports: an installed record whose registry line or file is missing, a registry entry that is not recorded, a registry that fails to load, an extension that needs a newer Bayit, files changed since apply, and a package folder that is gone. It exits with 1 on a problem. `bayit-doctor` shows the same install list.

## The install record

`shared/extensions/installed.json` is a list, `[]` upstream. Apply adds:

```json
{
 "id": "example-bank", "version": "1.0.0", "name": {"en": "…", "he": "…"},
 "seam": "statement-formats", "source": "local-extensions/example-bank", "minBayit": "1.56.0",
 "entries": {"statement-formats": ["example-bank"]},
 "files": ["shared/extensions/example-bank.mjs", "tests/extension-example-bank.test.mjs"],
 "hashes": {"shared/extensions/example-bank.mjs": "<sha256>", "tests/extension-example-bank.test.mjs": "<sha256>"},
 "registry": [{"seam": "statement-formats", "id": "example-bank", "file": "shared/extensions/example-bank.mjs", "export": "EXAMPLE_BANK", "alias": "ext_example_bank"}],
 "outbound": [], "dependencies": {}
}
```

`entries` and `files` are what bayit-doctor and the public export already read (`docs/extensions-registry.md`). `hashes` let remove and check notice local edits. `source` is where the package was applied from (relative to the copy when it is inside it); keep that folder, because update and re-apply need it. `registry` is enough to remove the extension even when the package folder is gone.

## Update

- **Updating an extension**: `apply <new-package> --update`. It removes the old version (stopping if its files were changed), applies the new one, and checks. If the new version fails, the old one is restored exactly. Applying the same version again with `--update` re-applies it.
- **Updating Bayit**: upstream never edits local registry files or extension files, so an update does not touch them. After an update, run `check`: an extension whose `minBayit` is now satisfied keeps working; one whose registry fails the new core checks is reported with its seam and id, and the person updates or removes it. `bayit-update` will do this for them (work package 3.5).
- **Dependencies** stay in `app/package.json` after remove, because another extension may use them; remove says so.

## Two extensions on the same seam

They coexist by construction: different file names (named after each id), different import names (`ext_<id>`), different marked lines, one list. Their entry ids must differ: the registry refuses a duplicate id, so the second apply rolls back with "this id is already registered". Order is install order, after the core entries; for statement formats, built-in formats are always recognised first, then extensions in install order. Each removes only its own lines.

Rules that span extensions (for example, a Today widget or Telegram command belongs to exactly one feature) are enforced by the core registry checks when apply loads them, so a conflicting second extension is refused and rolled back.

## Publishing

- **Fixed extension skill**: put the package in `.agents/skills/bayit-add-<name>/` in a fork, with `SKILL.md`, `REMOVE.md`, `extension.json`, `payload/` and `tests/`, and open a pull request. The public repository's CI (work package 3.3) applies it to a clean copy, runs the tests and the build, removes it, and checks the tree is clean.
- **From a generator**: the package in `local-extensions/<id>/` is already complete; move it into its own skill folder.
- `local-extensions/` is the person's own: upstream never ships it, and the public export does not copy it.

## Seams still missing

Some "add" requests cannot be an extension yet, because core has no local registry for them. A skill must say so plainly rather than edit core files.

| Need | Today | Proposed seam |
|---|---|---|
| **Today widgets** | Labels, the customize list and rendering are in `Today()` in `app/src/App.jsx`. | `app/src/extensions/today-widgets.jsx` → `EXTRA_TODAY_WIDGETS=[{id, label:{en,he}, Widget, adultsOnly?}]`, joined by `Today()` and `TodayCustomize`; the widget id must be owned by a feature (`EXTRA_FEATURES`), which already gates it. Seam key `today-widgets`. |
| **Card issuers** (linking a bank's card payment to a card company's statement) | `CARD_ISSUERS` in `shared/finance.mjs` | `EXTRA_CARD_ISSUERS`, or let a statement format declare `cardIssuer: {id, pattern}`. |
| **Merchant category rules** | `RULES` in `shared/finance.mjs` | `EXTRA_CATEGORY_RULES`, checked after the core rules. |
| **A new AI wire format** | branches in `app/cloud/ai-providers.mjs` | Adapter registry by `format`; until then a new format is a core contribution. |
| **Connection panels** | `app/src/extensions/connection-panels.jsx` exists but is a `.jsx` file that Node cannot load, so the script does not manage it yet. | Add it to the script's seams once its check can run without a browser build. |
