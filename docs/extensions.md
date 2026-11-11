# Extensions: adding to your Bayit

An **extension** adds one new ability to your own Bayit, for example reading another bank's statements or a new page for something your family keeps track of. It is a small package of files that sits next to Bayit's own code, so updating Bayit does not break it and removing it puts everything back the way it was.

Bayit has no central server and no app store. Each family runs its own installation, and each family chooses which extensions to add to it.

> **Honest limit, today:** adding or removing an extension needs an AI coding agent (such as Claude Code or Codex) or a terminal, and then the usual redeploy of your installation. There is no "Install" button in the app yet.

## What kinds of extensions exist

| Kind | What it adds | An example | Can you add one today? |
| --- | --- | --- | --- |
| **AI provider** | Another AI service for Bayit's AI helper | Mistral, or a model server in your home | Yes. The agent writes it for you with the `bayit-add-ai-provider` skill. |
| **Bank statement format** | Expenses learns to read another bank's or card company's PDF statement | Discount Bank statements | Yes, with `bayit-add-statement-format`. Every total is checked against the totals printed on the statement. |
| **Speech-to-text** | Another service that turns Telegram voice messages into text | A transcription service you already pay for | Yes, with `bayit-new-extension`. |
| **Sign-in method** | Another way for the family to sign in, next to Google | Your organisation's sign-in service | Possible with `bayit-new-extension`, but it **needs a security review** before a family uses it. Fingerprint/face sign-in (passkeys) is planned, not ready. |
| **Connection card** | A new card in **Settings › Accounts & connections**, with a step-by-step guide | A guide for a service your family uses | Yes, with `bayit-new-extension`. It cannot store its own codes or talk to its service yet. |
| **A whole screen with its own records** | A new place in the menu where the family keeps its own list | "Lent & borrowed": who borrowed the drill, and when | Yes, with `bayit-new-extension`. First version limits are below. |
| **Messaging channel** | Another way Bayit sends reminders, next to Telegram | WhatsApp or Signal | **Not yet.** The rules are written, but a working channel still needs changes in Bayit itself. |

A new Today widget is not an extension yet: it still needs a change to Bayit's own code (the `bayit-add-today-widget` skill explains this).

## Add an extension

1. Open your copy of Bayit (the folder you installed from) in Claude Code, Codex or another agent that reads skills.
2. Ask in your own words. For example:
   - "Add Mistral as an AI provider to my Bayit."
   - "Teach my Bayit to read Discount Bank statements."
   - "Make a Bayit extension for a 'Lent & borrowed' list."
   - "Install the Bayit extension from `<link to someone's repository>`."
3. The agent asks only what it needs from you, shows you which outside addresses the extension will contact, and installs it with one command (`node app/scripts/bayit-extension.mjs apply <folder>`). If any check fails, nothing is changed.
4. Your live Bayit changes only after you redeploy it, the same way you update it. On Cloudflare that is `npm run deploy:cloud` in the `app` folder; with Docker it is `docker compose up -d --build`. The agent asks before it deploys.

**An extension from someone else is code that will run in your family's Bayit.** Ask the agent to read it first and check it against the rules in [Building extensions](building-extensions.md#the-rules). Only install extensions from people you trust.

## Check it

- Ask the agent: "Check my Bayit extensions." It runs `node app/scripts/bayit-extension.mjs check`, which lists what is installed and reports anything missing, changed or too new for your Bayit.
- `node app/scripts/bayit-doctor.mjs` (the `bayit-check` skill) also lists installed extensions.
- Then look in the app:
  - an **AI provider** appears in **Settings › Accounts & connections › AI assistant**; a parent pastes its key there;
  - a **statement format** is recognised when you import that statement in **Expenses**;
  - a **new screen** appears under **More** like any other place, can be pinned in **Settings › General › Quick menu**, and parents switch it on or off for everyone in **Settings › Features**.

## Remove it

Ask the agent: "Remove the `<name>` extension from my Bayit." It follows the extension's `REMOVE.md` and runs `node app/scripts/bayit-extension.mjs remove <id>`. Your copy is then exactly as it was before the extension was added. Redeploy, as above.

Some things live outside the copy, and the extension's `REMOVE.md` says what to undo. For example, before removing an AI provider a parent chooses another one in the AI window; its saved key stays encrypted until a parent removes it there.

### What happens to your data

Bayit never deletes family data when you remove an extension.

For a **screen with its own records**:

- The records stay stored, **hidden from everyone**. Nobody can see or change them.
- Adding the same extension again brings everything back.
- A parent can find them in **Settings › Accounts & connections › Where the data lives**, as "Kept from a removed extension". There they **download a copy** first, and only then can they **delete** it for good. Deleting asks you to sign in again with Google if you have not done so in the last 30 minutes, and it cannot be undone.
- If other people kept private records in it, the delete step says how many people (a number only, never names or content). Those records are deleted too.

Statements you imported with a statement format are ordinary Expenses records, so they stay.

## What an extension can never do

Some of these rules Bayit enforces by itself. The others are checked by each extension's tests, and by you or your agent reading the extension before it is installed. That is why you should only install extensions from people you trust.

- **See another family's data.** Everything is looked up through your own household.
- **Show a person what they may not see.** Private items stay private: Bayit's server, not the extension, decides who sees each record. A screen with its own records uses the same "Only me / Family / Chosen people" choice as the rest of Bayit.
- **Show money or adults-only pages to children**, when the extension is marked adults-only.
- **Keep keys in files, logs or chat.** Keys live only in Bayit's encrypted household secrets.
- **Replace something Bayit already has.** An extension only adds; its name must be new.
- **Install half-way.** If a check fails during install, every change is rolled back.

A **screen with its own records** has extra limits in this first version. It cannot:

- contact any outside service or website;
- use keys or files;
- show a card on Today, send reminders, phone notifications or Telegram messages, or appear in Statistics;
- be read by Bayit AI.

Each of these may come later, one at a time, after a separate decision and review.

## Where to find extensions

There is no catalogue yet. Extensions are shared as folders in people's own repositories. See [Wanted extensions](extensions-wanted.md) for ideas, and [Building extensions](building-extensions.md) to make one.
