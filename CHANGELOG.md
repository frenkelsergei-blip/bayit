# Changelog

All notable changes to Bayit. Newest first. The same notes, in English and Hebrew, appear in the app under **Settings → About & updates**.

Bayit uses [semantic versioning](https://semver.org): minor versions add features, patch versions fix things. Database changes ship as migrations in `app/cloud/migrations/`; see [Updating and backups](docs/updating-and-backups.md).

## 1.76.0 · 2026-11-13

- On a computer or a wide tablet (from 1024 pixels wide), Today shows its sections in two columns, with Expenses and Bills side by side.
- Calendar on wide screens: Agenda opens an event's details beside the list, Month shows Your day beside the grid, and New event and Cards | List sit in the title row.
- Shopping shows the list with its side column (when you shop, Start, Finish, last shop) from 1024 pixels wide, and Start is a normal button.
- Started shopping by mistake? "I'm not shopping" puts the list back to planning and saves nothing; your ticks stay. Whoever was told on Telegram that you are shopping gets one short message that you are not. A started shop with no tick for 90 minutes ends by itself.
- Tasks opened from Today now shows all your tasks, with Overdue and Anytime, instead of only one day. Tasks, Today's week strip and Calendar go back to today when the date changes, even if the app stayed open.
- A task you tick on Today leaves the list after a moment. A quiet "✓ 2 done today" line opens what you finished, and unticking a task there puts it back.
- No migration. Wide layouts start at 1024px wide and 521px high (`breakpoints.wideLayout` in `design-system/tokens.json`); below that nothing changes. A stopped shop is kept as status `stopped` (never in History), and its Telegram follow-up goes out through the existing reminders path only to people who got the start message. The reminder cron Worker needs no redeploy.

## 1.75.0 · 2026-11-13

- Calendar and Tasks: repeat on your own schedule. Choose Repeats → Custom for "every 42 days", "every 6 weeks" or "every 3 months", and see the next dates before you save. Bayit AI can set these up too.
- Saving is lighter on Bayit's server, so changes and the 5-second refresh are stopped less often on Cloudflare's free plan. A save can still sometimes take a second try; nothing is lost.
- When Bayit's server can't be reached, the bar says so plainly and what is waiting ("Your layout choice is waiting to be saved"). The change stays on this device and is retried until it goes through.
- Today's Expenses and Bills cards no longer say "available after signing in" when you are signed in and the server didn't answer. They say the server could not be reached, try once more by themselves and offer Try again.
- No migration. Custom repeat adds an optional whole number `repeatEvery` to events and tasks (absent means 1); the rule is in `shared/repeat.mjs`, and existing events and tasks fall on exactly the same dates. The server answers an unchanged poll (`If-None-Match`) from the membership and revision alone, with the same membership check. The reminder cron Worker needs no redeploy.

## 1.74.0 · 2026-11-12

- Shopping › Prices and spending now shows prices from every receipt you can see, from all your lists and finished shops. Before, it could say "No receipts yet" after a shop was finished.
- A receipt in Shopping history can be downloaded: the photo (adults only, the same people who can view it), or its lines as a CSV file.
- Products you buy without writing them on the list are learned from your receipts, so they can come up in suggestions. Bags, deposits, discounts and similar lines are not counted.
- In a finished shop, each row shows what the receipt says. When the list used a different word, a small line says "Your list said: …".
- A receipt saved before version 1.71 on a list shared with chosen people is now visible to everyone on that list, including the list's owner. It is never shared wider than the list.
- No migration. The receipt sharing repair runs when the household's data loads (`upgradeShoppingLists` in `shared/shopping-lists.mjs`), adding only the list's own people; the stored record takes that form on the next save.

## 1.73.0 · 2026-11-12

- Today has a Cards | List switch, like Calendar, Tasks and Shopping.
- Cards on Today is more compact for everyone: smaller faces and icons, one-line event notes and shorter gaps, so more of your day fits on the screen.
- List shows each event, task and item on one line, and hides nothing: the same items and links as in Cards.
- The "Ask Bayit AI" card stays exactly as it was, in both views.
- If you already chose List under Settings › Lists, Today opens as a list after this update. Today's own switch changes it back.
- Children get the switch too, and their choice is their own.
- No data or migration change. The styles are in `app/src/today-density.css`, scoped to the Today page.

## 1.72.0 · 2026-11-12

- Shopping: ticking an item no longer tells the family that you are shopping. A shop starts when you press "Start shopping", or answer "Yes, I am shopping" when your first tick asks.
- Lists no longer finish by themselves. The last tick, or Finish, asks "Finished shopping?" with what was bought and what was not, and you choose whether to finish, with or without a receipt photo.
- The list says where it stands: "Planning" with the number of items, or "Shopping now · 2 of 5" with Finish always there.
- After a shop, one quiet "Last shop" line replaces the old banners. To undo a finish, open the shop in Shopping history (in the ⋯ menu) and press "Undo finish".
- Shopping history now shows the shops of all your lists in one place. "Complete list" and "Reuse for a new trip" are gone from the ⋯ menu, and each person's own private list stays hidden while it is empty.
- The planned shop's checkbox in Today and Tasks now opens the list, and the task is done when the shop is finished. A shop in History shows every receipt line with its price, and asks "Correct?" when it is not sure which item a line belongs to.
- No database migration: a started shop is a new shopping-list record with `status: 'shopping'` and `startedBy`. A phone still on 1.71 during the switch finishes a list on its last tick, as before.

## 1.71.0 · 2026-11-12

- Expenses has a new Categories tab: each category of the month with its total, the places you paid and every transaction. In Statistics, tapping a category opens it there.
- "Who we pay" keeps regular payees during the month, so it may list a few more providers mid-month and its monthly total may be a little higher.
- Shopping: when a shop is finished, what was bought moves to Shopping history and the list starts empty, with Undo. To finish with items left, press Finish on the green shopping line. A planned shop finished early counts for today.
- Receipt photos are now kept with the receipt in your installation's own file store (R2 on Cloudflare, the host file store on Docker). Only adults can see them, and deleting the receipt deletes the photo. This changes 1.68.0, where the photo was not kept.
- Items someone adds to a shared list are now visible to the list's owner, including items added earlier. Renaming such an item saves again.
- Prices: one row per product, "per kg" only for weighed items, and cheapest/dearest once there are two purchases. A receipt paid partly by meal card or voucher now shows the full total.

## 1.70.0 · 2026-11-12

- Telegram: the morning message shows the shopping list only on a planned shop day, with its time and who is going. On other days, /shopping still shows any list.
- All bot messages have a new layout: a heading over a quote box, each line starting with the time and the name, with details in italics. Hebrew items in an English chat no longer jump between sides.
- What a child finishes during the day, and what waits for your OK, now arrives as one message that updates itself instead of a new message each time. The Approve buttons stay on it.
- A bot with no picture gets the Bayit logo (Bot API `setMyProfilePhoto`). A picture you chose is kept; a parent can switch to the logo in Settings › Telegram › Manage the bot.

## 1.69.0 · 2026-11-12

- Shopping: photograph a handwritten note. Your household's AI helper turns it into a list to tick; items already on the list start unticked, and nothing is added until you press "Add N items". The photo is not kept. For adults, from the list's ⋯ menu.
- Receipts: a line Bayit doesn't recognise asks "Correct?" once. Tell it what the line is and it remembers the name for the next receipt.
- Liked at home: an adult can keep a favourite to themselves with "Only me"; it is suggested only on their own private list.
- Parents can let a child's likes go straight in, child by child, in Shopping settings. By default every child still asks.

## 1.68.0 · 2026-11-12

- The shopping list now suggests what to buy. One card above the list, "Before the shop", based on what you usually buy. Go through the suggestions one at a time: add, already bought, not this time, or stop suggesting. It works without AI, and you can turn it off in Shopping settings.
- Liked at home: what each person likes is suggested when it hasn't been bought for a week. Children can ask, and a parent approves.
- The next shop's date shows on the list. When someone starts ticking, everyone sees they're shopping, and what is added meanwhile appears on top.
- Telegram: on shop day the morning summary says "Shopping today". Whoever is shopping gets each new item; each person can turn these messages off in Shopping settings. "Add cucumbers and tomatoes" adds at once, with Undo, even without AI.
- Photograph a receipt (adults, with an AI helper): your AI helper reads the prices, you check and save, and the photo is not kept. Then see prices over time and this month's supermarket spending from your statements.

## 1.67.0 · 2026-11-11

- Shopping: swipe an item left to delete it, like notifications, and delete a whole list from its ⋯ menu or edit window. Everyone who shares a list can remove its items, and Undo always brings them back.

## 1.66.0 · 2026-11-11

- Bayit AI (in the app and on Telegram) now knows whose turn it is today and tomorrow, for the shower and other activities that take turns, including when a parent swapped the order. Turns that rotate daily now really change from one day to the next.

## 1.65.1 · 2026-11-11

- Kids › Turns now lists only activities that take turns. Activities set to Together, like meals or getting dressed, no longer show a turn order, and the child's history still includes them.

## 1.65.0 · 2026-11-11

- Tasks, Today and Calendar now open on what's yours: tasks and events assigned to you, plus whole-family ones, unassigned ones and birthdays. One tap on "Show everyone" shows the whole family, and Bayit remembers that choice on this device.

## 1.64.1 · 2026-11-11

- **Docker: the quick start works again.** A typo in `compose.yaml` (an unquoted comma in the `/tmp` mount) stopped `docker compose up` on every machine with `invalid mount path: 'mode=1777'`. It is fixed, a test checks the file, and CI now runs the exact documented quick start (`cp .env.example .env`, `docker compose up -d --build`, the health check and the setup-code line).
- **No Google project needed.** The Docker and Cloudflare guides, the README and the install skills now start with passkeys: `docker compose up`, read the one-time setup code with `docker compose logs bayit`, open <http://localhost:8080>, choose **Start setting up** and create your passkey and family. Google sign-in is optional. The guides explain the terms they use and include a restore command next to the backup.
- **About passkeys** (new since 1.59.0): passkey sign-in passed an independent code review and is switched on on the maintainers' own installation, but it **has not yet been confirmed on real phones**. It is on by default; set `BAYIT_PASSKEYS=off` to offer Google only. Google sign-in keeps working either way.
- Bayit AI: a stray "0" no longer shows above your own typed message. Spoken questions still show their recording length.
- `bayit-configure.mjs` prints a clear one-line message instead of a stack trace when a name or ID is wrong.

## 1.64.0 · 2026-11-11

- A new installation now guides you from the first open: Bayit checks the address, the database and your browser before the setup code, then your name, passkey and family name, and ends with a short To start list: invite your family (a link per person, Send or Copy), and optionally the AI helper and Telegram. A card on Today keeps the rest until it's done. Families already using Bayit see no change.
- On small screens, the "Own this installation and can't sign in?" link no longer sits on the drawing.

## 1.63.0 · 2026-11-11

- One Bayit AI: the menu item and the floating button now open the same thing, with four tabs — Chat, Suggestions, History and Settings. Every AI option (connection, what Bayit AI may read, recommendations, daily ideas, the summary, the button, voice, usage and cost) now lives in one place, Bayit AI › Settings; Settings only links there.

## 1.62.0 · 2026-11-11

- Times sit neatly in the middle of their boxes everywhere, on iPhone too: quiet hours, events, reminders, Bayit AI and every other time field now share one control, the same height as the fields around it.
- Settings › Family: the account buttons are shorter (Disconnect, Help back in) and sit under the name on phones, so names are never covered. The daily suggestions settings are one tidy card with even spacing.

## 1.61.0 · 2026-11-11

- The kids' routines no longer fill grown-ups' Tasks and Today. They stay on the Kids screen; in Tasks, the "Kids' routines" filter shows them when you want, and Today shows one short line ("Kids' routines · 7 of 12 done") that opens Kids. One-off tasks for a child still show as usual.

## 1.60.0 · 2026-11-10

- Hundreds of new Bayit icons: about 340 new drawings in Bayit's style for events, Jewish, Israeli, Christian and Muslim holidays, birthdays and parties, health, school, clubs, travel, home, car, work, pets, weather and money. The icon window shows Recent first and a section per category, and search works in Hebrew and English (חנוכה, Hanukkah, פסח, party…). A new event starts with the Event icon.

## 1.59.0 · 2026-11-10

- Sign in with a passkey ("מפתח גישה": Face ID, fingerprint or your phone's screen lock) instead of Google. It needs no Google Cloud setup, and Google sign-in keeps working alongside it. Setting up, joining with an invitation, confirming it's you, and getting back in after losing a phone are all included. See [Sign-in methods](docs/sign-in-methods.md).
- **Not yet tested on real phones.** Passkey sign-in passed an independent code review, but it has not been tried on real phones yet. It is on by default; set `BAYIT_PASSKEYS=off` to offer Google only. Google sign-in keeps working either way. The maintainers' own installation switched it on on 2026-11-11 to test it on real phones.
- Database: migration `0021_passkeys.sql` (apply it before deploying this version).

## 1.58.2 · 2026-11-10

- Puzzle: every picture is now a full scene (the garden island and the moonlight garden no longer float on an empty background), and "Choose another picture" opens a window right on screen where you pick a picture and start a new puzzle.

## 1.58.1 · 2026-11-10

- The Bayit AI button now steps aside while you fill in a form or use a window, so it never covers Save.

## 1.58.0 · 2026-11-10

- Nothing changes in how your family uses Bayit: same screens, and Telegram sends the same messages as before.
- For people who extend Bayit: Telegram now works through a general channel connection, so other messaging apps can be added the same way; a whole new screen with its own records can be added as an extension; updating Bayit keeps the extensions you installed; and there is a guided way to build a new extension, with new guides.

## 1.57.1 · 2026-11-10

- Drop-down lists and date pickers now always open on top: the icon category list in the icon picker (for example when adding an event) opened behind it and couldn't be seen.

## 1.57.0 · 2026-11-10

- Statistics: Money is now called Expenses and comes right after Overview.
- Section menus show clearly when there is more: on most phones all of Statistics fits, and where it doesn't, part of the next tile shows and a short nudge points to it once. Swiping the menu moves at once.

## 1.56.0 · 2026-11-10

- Settings › Accounts & connections is simpler: "To start" shows what to set up first, everything else waits under "More connections", and every connection opens the same step-by-step guide in one window.
- The Telegram window is tidier: a parent sees a short summary and the family's chats, everyone else sees only "My Telegram chat", and Photos & voice has its own row.
- How much AI Bayit uses now sits inside the AI window, and the Bayit AI recommendations switch moved to AI › Daily suggestions.
- After you confirm with Google, changes to accounts and connections stay open for 30 minutes instead of 10, so a first setup no longer asks again halfway.

## 1.55.0 · 2026-11-10

- The Bayit AI button now sits exactly as far from the menu as from the side on every phone, and short notices no longer cover the menu or the button.
- The Ask Bayit AI page uses the same chat as the button: questions you tap are sent, you see Sent and Thinking, recordings show "Turning your voice into text", mixed Hebrew and English lines read in their own direction, and Prepare a plan is right in the chat.

## 1.54.0 · 2026-11-10

- Statistics › Money: a RiseUp card is no longer shown under the person who connected RiseUp. Cards nobody has claimed wait under "Not assigned yet" with "Choose whose". Bayit suggests whose a card is and its last 4 digits when the same purchases appear on an imported statement, or from the card's RiseUp nickname. You confirm, and it never makes up digits.
- The selected card is now clear: a gold ring on the front card and its whole row highlighted, with nothing jumping. Swipe the stack, use the arrows or dots, or tap "+2" to reach every card.
- Cards without an ending say where they're used most (e.g. "mostly at Shufersal"), so similar cards can be told apart.

## 1.53.0 · 2026-11-10

- Who we pay: a company you pay for several things (like Cellcom for phone, internet and electricity) now reads clearly as one company with its services, and each company and each heading opens and closes.

## 1.52.0 · 2026-11-10

- Bayit AI on every screen: a floating Bayit AI button (or a side tab, or next to the bell — your choice in Settings › General) opens a chat over the screen you're on. Ask by typing or by voice, see clear Sent / Thinking / Answer steps, tap a task in the answer to open it, approve proposed changes, and find every past conversation in History (only you see yours).

## 1.51.1 · 2026-11-10

- AI answers are now easy to scan: each part has its own icon and colour, times sit in small pills, and the people involved show with their faces.

## 1.51.0 · 2026-11-10

- A calmer header: the Bayit logo sits next to the menu, your family next to the notifications bell, and the saving sign no longer appears there.
- Answers from Bayit's AI in the app are easier to read: a short answer first, then clear sections and lists.

## 1.50.1 · 2026-11-10

- Bayit AI has its final mark: a spark hugging the corner of the roof.

## 1.50.0 · 2026-11-10

- Bayit AI: when it's on (Settings → Accounts & connections, a parent turns it on), Bayit looks at your money and adds things worth a check to Today and Tasks with its own mark — a new recurring charge (a forgotten trial), a price jump on a fixed charge, or the same charge twice. Tick to mark it checked, or open it to see the last months, why, and answer OK / Needs action (makes a task) / Not relevant. Electricity, water, gas and arnona aren't flagged for price changes. Adults only; choose a daily or weekly summary in Settings → Notifications.

## 1.49.0 · 2026-11-10

- You can now see Who we pay by company as well as by area: Cellcom's phone, internet and electricity in one card with the company total.
- Who we pay: electricity bought from a phone company (Cellcom Energy and others) is now electricity, separate from the phone bill; shop purchases and purchases paid in instalments no longer show as providers. Each provider shows its payment history and opens its payments in Transactions. The month control now works on this view, the categories are in a clearer order, and changing a provider's category works on phones (drop-down lists inside windows on phones can be tapped again).

## 1.48.1 · 2026-11-10

- Expenses on phones: the month no longer runs into the picker arrow.
- Statistics in Hebrew: the amounts on the side of the charts no longer run into the bars.

## 1.48.0 · 2026-11-09

- Today: a new assistant at the top of Today. Ask your home a question, or turn a message into one plan with several items and a reminder for each, saved together so you can come back to it.
- Expenses: filter by whose card it is. Each adult appears with their cards stacked beside them, and bank accounts sit under Shared. Pick several at once, then narrow to single cards. Works the same for RiseUp and imported statements; before, "Max" missed every purchase synced through RiseUp.
- Statistics › Money: "By person and card" stacks each person's cards and shows six months per card, this month and the monthly average. Tap a card behind to bring it to the front, or a row to see its months and top categories. A Cards & accounts filter takes several choices.
- New Cards & accounts window: choose whose each card is or mark it shared, and add a RiseUp card's last 4 digits to join it with its statement.
- When a statement doesn't print the card number, you can say which card it is (optional). Recorded expenses can say which card or account paid (optional).
- Original card and bank marks for Israeli issuers; cards from anywhere else get a neutral look.

## 1.47.0 · 2026-11-09

- Choose what your family uses. Settings › Features lets a parent turn features on or off for the whole family, and each person can hide what they don't need, just for themselves. Nothing is deleted: turn a feature back on and everything returns. New families start with a short setup: a few questions, suggested features, and simple guides for connecting your own accounts.

## 1.46.0 · 2026-11-09

- Puzzle: the "more pieces" sign is now a small arrow on the edge of the tray that gently nudges, so it no longer covers pieces. The tray always shows whole pieces, and swiping or tapping the arrow moves a full column at a time.

## 1.45.0 · 2026-11-09

- Expenses: the new "Who we pay" view shows at a glance which providers and subscriptions the family pays and how much — phone → Cellcom, TV → FreeTV, electricity, arnona, insurance, streaming and more. Messy statement names are grouped into one provider, price rises and overlapping services stand out, and you can rename, combine, hide or add a provider. With your household's AI connected, a short summary refreshes once a month. It replaces the Fixed bills list.
- The yellow "partial month" note now sits below the numbers instead of between the controls and your data.

## 1.44.0 · 2026-11-09

- Puzzle: placed pieces leave the tray and the rest slide into the free spots, so the tray shrinks to one page. The tray scrolls smoothly, and a yellow "+N" sign shows how many more pieces are waiting; tap it to see them.

## 1.43.0 · 2026-11-09

- Settings › Accounts & connections now shows parents how much AI Bayit uses, by person and feature, with this month's spend, a 30-day chart, and an estimate of how long your prepaid credit will last. Enter your credit once; the provider's billing page stays the real balance.

## 1.42.0 · 2026-11-09

- Vouchers, Message to plan, Today suggestions and the Google Calendar connection are back. A release earlier today accidentally left them out; nothing you saved was lost.
- Includes offline mode, the new section menus and the Settings photo and Quiet hours fixes.

## 1.41.0 · 2026-11-09

- Connect Google Calendar in Settings to share availability, import selected events, or keep a selected Bayit event updated in its own Google calendar.

## 1.40.0 · 2026-11-09

- Household › Vouchers keeps your vouchers private. Add a voucher photo, show its code at checkout, track the remaining balance, and set expiry reminders.
- Today › Message to plan turns a message, photo or PDF into a draft to review before saving tasks or events.
- Enable suggestions on Today to see overdue tasks, unassigned pickups and expiring vouchers.

## 1.39.1 · 2026-11-09

- The family photo is larger on phones, with the camera badge centered on the bottom edge.
- Quiet hours fields stay level, with the times centered vertically even when a label wraps.

## 1.39.0 · 2026-11-09

- Bayit now opens without a connection. You see your latest Today, Calendar, Tasks, Shopping and kids' day, marked "Offline · showing data from …". Ticks, new items and finished tasks made offline wait on your device and sync when you're back online.
- Section menus on every page now look the same: the icon above its label, with a half tile peeking out when there is more to scroll.

## 1.38.1 · 2026-11-09

- Titles written in the other language (a Hebrew reminder in the English app, or the reverse) now line up with everything else in Notifications and other lists, instead of sitting on the far side.

## 1.38.0 · 2026-11-09

- Assigning someone now always lets them see it. If you choose "Only me" and assign another person, it becomes "Selected people: you and them", and the form says so.
- Today, My Space, reminders, Telegram and Push use the same rule for "mine":  what's assigned to you plus your own private items. The Tasks page shows everything you may see; use the person filter for "assigned to me".

## 1.37.2 · 2026-11-09

- Statistics by area: Overview, Tasks, Calendar, Kids, Shopping and Money tabs with clear charts, summary cards and trends. Only the areas your family uses appear, children never see money, and missing data is shown as missing, not as zero.
- Household shows your data first: Expenses and Insurance have one short row of controls, compact view switches, and refresh/import/RiseUp in a Data & sync section at the bottom. Sections now run Expenses, Insurance, Documents, Maintenance, Pantry, Meals.
- Shopping: the icon picker opens on top of the item editor.

## 1.37.1 · 2026-11-08

- My Hero: larger touch areas, full-screen windows on phones, and the supermarket fits side by side on a phone held sideways. Products stand exactly on the shelves.
- A right pick gets a gold outline, a star burst and a pop; a wrong one a red outline and a shake (supermarket, budget shopping and puzzle).

## 1.37.0 · 2026-11-08

- My Hero: the garden responds again (planting, watering and harvesting by tap or drag); Rest is available whenever energy is below full; the puzzle no longer gets stuck and pieces can be dragged or tapped and then placed with a tap; supermarket products all sit on real shelves; Simon shows clearly after every round whether it was right or a mistake and moves on by itself.
- Statistics: one aligned filter row, full-width tabs and summary cards whose labels no longer overlap their numbers; children don't see the household money tab; Hebrew charts read right to left.
- My Space › My tasks shows your private tasks and everything assigned to you, including overdue and undated tasks today.
- Scrolling section bars keep their solid colour: only the tabs fade at the edge that has more, and the chosen tab always opens in full view.

## 1.36.1 · 2026-11-08

- Journal: "Assigned to" in a note uses the same person chips as every other form.
- On phones, task and event details fill the screen; the Household filter window uses 44px fields with buttons that never wrap; times like 19:00 sit centred in their field.

## 1.36.0 · 2026-11-08

- Journal and My Space: notes open in the same window as the rest of the app, with Details, When and Privacy sections, Cancel then Save, and Delete only on saved notes. On phones the editors and details fill the screen with the menu at the top or bottom.
- The journal has one search row with a Filters button, so the first entries show on the first screen. Rows are calmer, completed tasks show who did them, new notes stay in view after saving, and tags with spaces work.

## 1.35.1 · 2026-11-08

- Statistics, My Space and Journal buttons use the shared 44px size too.

## 1.35.0 · 2026-11-08

- All pages now share one header: the title starts at the content edge with the same size and spacing, and Cards/List sits beside the title. The title underline is sharper.
- Buttons and fields share one 44px height across the app, including Settings, Household and Shopping, and Delete buttons are marked in red.
- Today's "Little things to do" shows every task assigned to you (today, overdue and without a date) and nothing assigned only to someone else; the kids' tasks stay in their own part below.

## 1.34.0 · 2026-11-08

- When someone else deletes, moves, renames or changes the place of an event, task or routine assigned to you, or removes you from it, Bayit tells you on Telegram, by Push and in the notifications inbox, and corrects reminders it already sent ("Moved to Thu 12 Nov 16:40", Snooze removed). Quick edits become one message, quiet hours delay it, and Settings → Notifications → "Changes to things assigned to me" turns it off.
- Today's "Little things to do" now also shows unfinished earlier tasks (Overdue) and tasks without a date (Anytime), like the Tasks page. Parents see the kids' tasks below their own, with each child's photo; Customize Today can hide them.
- Rows on Today show only the round photo of the assigned person at the end of the row, so titles get the full width.
- Routines on chosen days read "5 days a week" instead of "Once". The repeat "Ends" choice shows clearly which option is chosen and explains it.
- Your Bayit language is saved to your profile automatically, so Telegram uses the same language as the app. Calendar and form controls share one 44px height.

## 1.33.1 · 2026-11-08

- Telegram and phone reminders are checked again just before sending: a reminder goes out only if the item still happens on that day and within that time, so a moved or rescheduled event no longer sends a reminder for its old date.
- A snoozed reminder is no longer re-sent after its event moved, finished or already started, and reminders for a later day no longer offer "Snooze 10 min". Times that have passed say "25 min ago".
- Hebrew chats no longer show English error messages; button replies and Start-link replies follow your Bayit language. Insurance import shows Hebrew names. Money alerts keep merchant names whole and say "Over by" when a limit is exceeded.

## 1.33.0 · 2026-11-08

- On phones every window (New list, filters, pantry, meals, expenses, insurance and more) opens full screen like the event and task forms: the title and close button on top, the content scrolls, and Cancel / Save stay at the bottom. This works with the menu at the top or at the bottom, and nothing from the page shows below the buttons.
- With the menu at the top, the phone event and task forms keep Save on the screen bottom without an empty strip below it.
- Hebrew page titles start at the page edge on every screen, like English, and the subtitle shows on landscape phones too.
- In Hebrew the three dots of More sit after the word, and scrolling tab bars fade only on the side that has more to show.
- Item pictures in Household forms line up with their name field, and window titles have one size; a tapped close button no longer shows a blue frame.

## 1.32.1 · 2026-11-08

- Household buttons keep comfortable inner spacing on every screen, and in landscape on phones the Documents toolbar stays on one row so the first document is visible.

## 1.32.0 · 2026-11-08

- Shopping fits more on screen: the first items now show on phones, including iPhone landscape, and the item, list and trip windows use the same section design as other forms.
- Adding an item that is already on the list keeps its unit ("2 bottles" + 1 = "3 bottles"), and the cursor stays ready for the next item.
- On Today, the Shopping label on a shopping task opens the shopping list, and lists can be renamed directly on wide screens.
- Household (meals, pantry, expenses, insurance, maintenance and documents) uses the shared page layout: a compact title, one row of section tabs that scrolls on phones, one step of spacing, and the first items visible on every screen, including iPhone landscape.
- Household forms and filters open in the shared window with sections, and dates are written the same way everywhere.

## 1.31.0 · 2026-11-08

- Settings is reorganised into clear sections on every page, with equal-height cards and compact choices. Notifications groups reminders, quiet hours, delivery, preview, money goals and insurance reminders.
- The family name is edited in one place (Family), and the change is saved only after the household server confirms it.
- The Settings menu stays on one row on every screen; on phones the first setting is visible right away and the chosen tile is never hidden under the edge fade.

## 1.30.0 · 2026-11-08

- Event, task and routine forms are grouped into clear sections (Details, When & where, Notifications, Privacy & permissions) that can collapse. On desktop they use two columns with Save and Cancel in one footer.
- Events and tasks can have up to five reminders, such as 3 days, 1 day and 10 minutes before. Each one arrives once in Bayit, as a push notification and on Telegram. Settings › Notifications offers several default reminders per category, and all-day items can remind you “1 day before at 09:00”.
- Tasks shows more on the first screen: list cards in one row, and one filter row with a Filters window for people, priority, order and search. A child can tick the steps of their own task, and tasks from a deleted list appear under General.
- Hebrew text is clearer: normal letter spacing and cleaner weights for small text.

## 1.29.2 · 2026-11-08

- Phone event, task and routine forms keep Save and Cancel on a solid bar right above the menu, and Note shows an example of what to write.
- Agenda is now a rolling list of what is coming up from today, while Week stays the Sunday–Saturday planner. People on event cards have the same white ring as elsewhere.
- Today labels only real repeats, with their frequency. On phones every task lines up the same way, sections have a divider, and Customize has a centred sliders icon.

## 1.29.1 · 2026-11-08

- Calendar shows more of your week: a smaller title, New event beside it and one toolbar row. Phones show two to three days on the first screen, and landscape phones now show events.
- Agenda titles wrap to two lines instead of being cut short. The desktop Month day list is wider, and event details use one title size.
- Fixed: an event opened from a link no longer reappears when you switch to Month, Hebrew previous/next arrows point the right way, and Cards/List appears only in Week.

## 1.29.0 · 2026-11-08

- Telegram messages share one clear layout: an icon and bold title, the date or time, short sections and a hint. Reminders, the morning summary, alerts, commands, imports and AI replies all follow it.
- Hebrew Telegram messages read right to left on every line, with commands kept intact. Dates, quantities and counts are written in your language instead of 2026-11-08 or “12 items”.
- /tasks, /week, /lists and /shopping match the morning summary, and AI answers show tables, nested lists and links clearly.

## 1.28.2 · 2026-11-08

- Today is more compact on desktop, tablet and phones: a smaller title, a one-row week strip, and sections that start higher. Text size settings now scale the Today title.
- Today task rows keep the checkbox, icon, name and assigned person on one aligned line wherever there is room.
- Customize Today opens one clear list to show, hide and reorder sections. A task completed by mistake can be unchecked right away.

## 1.28.1 · 2026-11-08

- Today assignee labels are compact on desktop and phones, while the tablet section layout is preserved.
- Multiple assigned or insured people use consistent overlapping avatars. Complete names remain available in details and accessible labels; individual people choices are preserved.

## 1.28.0 · 2026-11-08

- Today gives tablet agenda and tasks room, uses Calendar people pills, and hides completed occurrences. Tasks opens on Today and To do with readable priority labels. Hebrew mirrors the header.
- Month event details have two readable desktop columns and reachable actions. Phone and tablet sheets retain their return path.
- Notifications support left-swipe removal, Remove all, clear empty filters and recovery after refused saves. The bell counter is compact and centered.
- Each connection opens in a focused dialog with a top Close button. Maps puts its keys first and makes required Google confirmation clear.
- The parent area fills the content width in both places and preserves the entered PIN when opening fails. Existing household codes are preserved.
- Other assignees with access receive shared-task completion updates, respecting notification settings, quiet hours and duplicate protection.

## 1.27.0 · 2026-11-08

- Kids has one stable header and compact navigation matching Household. Both children stay visible as direct shared portrait/name choices.
- The selected child follows My day, Routines, My Hero and Parents. New activities select that child in advance; My Hero has a clear subtitle.
- Page actions sit below navigation. Turns explains the shared order and shows the selected child's activity history with readable statuses.
- Parent coin bonuses and their history appear only in Parents. Changing the child clears an unfinished bonus reason; selection waits during saving.
- Garden decorations stay clear of signs even after opening Games first. Existing purchases, balances, progress and access rules are preserved.

## 1.26.1 · 2026-11-08

- Kids, My Hero, the garden and the parent card align to the full content width on larger screens. Child names are centered.
- Picture puzzle shows all sixteen matching-size pieces together on desktop, with an aligned board and tray. Phones and tablets have a swipe tray without page buttons.
- The magnifying glass stays complete when worn with a hat for all eight children, including portraits.
- Inner tabs keep their menu and focus, without replaying the whole-page entrance or resetting scroll. Editor and main-section navigation retain their normal behavior.

## 1.26.0 · 2026-11-07

- Picture puzzle has 12 illustrated stages, full-color aligned pictures, clear contour hints and matching-size pieces across phone, tablet and desktop.
- Every completed game automatically earns saved XP and shop coins, including repeat wins. Simon has five rounds and clean colored lights.
- Supermarket search keeps the requested product visible. Garden counts align, signs and decorations stay separate and pixel shadows stay inside the garden.
- Parent bonuses select a real child and show a clear recipient, saved confirmation and refreshed, aligned history with reasons and dates.

## 1.25.2 · 2026-11-07

- Phone Kids completion buttons fit their full label and check mark, including larger text and compact lists.

## 1.25.1 · 2026-11-07

- Profile Save/Cancel appears only for unsaved changes and stays with the profile fields while scrolling. Refused saves retain the draft for retry.

## 1.25.0 · 2026-11-07

- The selected blue-and-yellow Bayit logo appears throughout the app, loading and sign-in screens, notifications and installation icons. In-app light and night logos have real transparency.
- Tasks keep every assignee on one shared task, show the complete assignment in details, and send each recipient reminders according to their own access and preferences.
- The month calendar has clearer day cells, readable date markers and an accessible day sheet; Week and Agenda keep their existing layouts.
- My Hero adds a clearer food fridge, collection and room placement, child care poses, garden controls, interlocking puzzles and Simon. Rest restores energy over five minutes and wakes the child automatically.
- Authenticated parents can grant virtual bonus coins with a reason and history in a protected parent area. Coins and XP remain separate.

## 1.24.2 · 2026-11-07

- Keep equal space above and below navigation buttons in either menu position, with a subtle shadow separating navigation from content.
- Hide phone scrollbars while keeping normal scrolling available throughout the app.

## 1.24.0 · 2026-11-07

- My Hero keeps the Kids submenu and opens one clear activity at a time: Care, Garden, Games or Dress up.
- Care adds gentle need meters, simple action buttons and a food-only fridge and food shop; outfits stay in Dress up.
- One illustrated garden combines vegetable beds and orchard, with real seed packets, drag-or-tap planting, direct Water and Harvest tools, and all eight children working at the selected spot.
- Games explain free play, offer separate saved rounds and clear wake-up recovery. Picture puzzles use sixteen real interlocking pieces and show saved progress.

## 1.23.2 · 2026-11-07

- Keep the saving indicator aligned inside the header, with one clear server-backed saving state.
- Navigation and More follow the selected theme and menu color; menu-position labels and checkmarks stay aligned.
- Tighter phone menu spacing respects rounded screen corners and counts safe areas once. Rotation dismisses navigation overlays and restores scrolling.

## 1.23.1 · 2026-11-07

- Keep the sample-data status clear of the new menu in both positions, including Hebrew tablet and landscape layouts.

## 1.23.0 · 2026-11-07

- A compact shared header and horizontal menu, with a yellow selected state. Choose the menu below the header or at the bottom in Colors & appearance.
- Consistent Bayit branding, family default image and sign-in screens, with a hand-sketched paper loading animation and reduced-motion support.
- A cleaner month calendar grid. Tap a day to see its events and add an event for that date; the surrounding Calendar controls and other module layouts are preserved.

## 1.22.2 · 2026-11-07

- Restored Telegram replies, voice-message processing and scheduled morning summaries on Cloudflare. Provider requests keep redirect protection.

## 1.22.1 · 2026-11-07

- Family members permitted to record home maintenance can complete a service even when a linked receipt or contact is private to its owner. The private link stays private and is preserved.

## 1.22.0 · 2026-11-07

- Combine multiple insurance types and people in dropdown filters, with statistics for the combined selection.
- Documents open inside Bayit, including PDF, photos, text and a read-only Excel view. Dates are optional. Filter by several categories or people, file type, privacy and dates, and sort the results.
- Summarize a document with your connected AI provider: review the draft, quoted facts and explicit dates, then choose what to add and save. Manual notes and original files are preserved.
- Contact and Household forms keep themed Save and Cancel actions reachable on phones. Maintenance adds editable starter tasks, filtering, service history and reminders; Pantry adds useful sorting and stock/date filters.
- Keep reusable recipes separately from dated meal plans, with preparation notes, ingredients and explicit sharing.
- Pin documents and other records to your personal Today screen. Optional Household widgets include documents, low pantry stock, home care, meals and insurance dates for adults. Pins follow the original access rules.

## 1.21.0 · 2026-11-07

- Choose who a document concerns separately from its uploader and viewers. Set private, family or selected-person access before uploading.
- Organize documents with multiple categories, personal categories and licensed icons; filter by person or category and manage labels without deleting files.
- Confirmed Har HaBituach imports through the website and linked Telegram bot retain the exact original report privately under Documents → Insurance, with source history and download/file management. Source reports remain separate from full policy terms.
- Insurance details preserve your original tab and filters, improve Hebrew/English and phone layouts, and make premiums, status, insured people and review checks clearer.
- Remember private ID-to-person matches for future report imports, with masked management and explicit insured-person choices. Matching never grants access or changes existing policies.

## 1.20.0 · 2026-11-07

- Insurance adds Summary, Policies and Review: grouped coverage rows, breakdowns by type and insured people, renewal/document checks, and separate report premiums and loaded debits.
- An optional AI review uses only selected authorized summaries, masks known identifiers and leaves policies unchanged. Original documents and payment details are excluded.
- People filters share the family portrait and face-stack picker on phone, tablet and desktop. Insurance filters close predictably and group rows become smaller in List.
- My Hero refines care scenes, simplifies room actions and improves garden scale, labels and character feedback. Add a separate fruit orchard with seeds, seedlings and contextual planting, watering and harvesting.
- Saved text and menu sizes are respected through phone rotation; Escape closes a nested choice before its form.
- Calendar day windows close before starting a new event, keeping controls and scrolling available when you return.

## 1.19.5 · 2026-11-06

- Refresh an existing RiseUp connection without a new Google sign-in. Automatic refresh checks eligible connections hourly and respects provider wait times.
- Sensitive connection changes retain Google verification; successful verification returns to the connection for an explicit retry.
- Clearer landscape family menu and accessible notification counts.

## 1.19.4 · 2026-11-06

- Keep Save and Cancel reachable at the bottom of task, event and routine forms on short landscape screens. Improve the contrast of routine details.

## 1.19.3 · 2026-11-06

- Better profile portrait/name spacing and action rows on phone, tablet and desktop.
- Household statistics include accessible imported and manual money records once, with clear missing-data, loading and error states.
- Choose a task list or General in task forms. Touch forms wait for your tap before opening the keyboard.

## 1.19.2 · 2026-11-06

- Clear selected views, circular family and people portraits, readable month controls and stable phone profile/shopping layouts.
- Calendar month days open their event list; Week List keeps the week together. Improve child selection and preserve page scrolling after closing dialogs.

## 1.19.1 · 2026-11-06

- Page scrolling resumes after closing an insurance editor, import window or notification inbox. Long insurance lists remain scrollable on desktop, tablet and phone.

## 1.19.0 · 2026-11-06

- A dedicated Insurance register imports Har HaBituach Excel reports, keeps every coverage row and original policy-number digits, and separates insured people from payers.
- Review payment matches and attach policy documents with their own validity dates; keep previous document versions.
- Choose renewal and document reminders. Send an insurance Excel report to your linked Telegram bot, choose the insured person and confirm private import.
- Find a step-by-step Har HaBituach import guide in Insurance notification settings. Reports are snapshots; no automatic government connection is configured.
- My Hero adds shopping with exact round budgets, supermarket search, rhythm and 16-piece puzzles, using the selected open cart and wooden shelves.
- Grow 12 crops through four illustrated stages in a six-plot garden: water, harvest, sell, use the virtual fridge and decorate. Absence does not kill crops.
- All eight child heroes keep fitted equipment and improved care scenes with stationary furniture. Progress, purchases and rewards wait for household confirmation.

## 1.18.0 · 2026-11-06

- Security: safer documents, verified child identity, privacy checks, device sessions and private installation controls.
- Tap a money row for its complete original name, transaction and charge dates, source/payment details and six months of matching merchant history. Merchant names retain their beginning in Hebrew and English.
- Record income, expenses and savings transfers separately. Configure monthly and category spending caps, advance warnings and separate goals for projected month-end money remaining and transfers actually recorded.
- Choose finance alerts in Bayit, on your connected devices or in your linked Telegram chat, plus an optional weekly summary. Private and shared views use their own accessible records.
- Expenses open on the current month, with compact filters, source sync times and a clear refresh action. Statistics follow the selected dates and loaded history.
- Forms keep their draft after a refused save and confirm only after the household server accepts. Clearer Undo, deletion and list controls, full numeric times and consistent people/view controls.
- Add an optional place name to events and tasks. Connect your installation’s Google Maps for address search and a compact preview; links open the original authorized activity.
- Document and access checks have been strengthened. Device notifications now stop when you sign out; enable Push again on devices connected before this update.

## 1.17.0 · 2026-11-06

- My Hero is now a small virtual home: feed, shower, tidy up, play and rest. All eight characters eat at a table, shower behind a curtain and sleep covered in bed.
- Collect 60 virtual items and 10 moves, stock your fridge and decorate your room. Stars come from real quest XP; spending keeps your level. Purchases and care wait for household confirmation.

## 1.16.0 · 2026-11-06

- Compact list mode: Settings › Colors & appearance › Lists, or Cards | List on each page. Thin one-line rows that fit about twice as many tasks, items, expenses and more, lined up like a table.
- Hebrew and English mix correctly: titles you type keep their word order in either interface, the title underline sits under the real last word, and + / − signs stay before the number.
- Task rows give the text more room: the person’s photo at the edge, a line of the note, and XP only in the task details.
- New tasks start with a notebook icon and new events with a calendar, instead of a dinner plate.

## 1.15.0 · 2026-11-06

- Notifications on your phone or computer, like any app: Settings → Notifications → Notifications on this device. On iPhone, add Bayit to the Home Screen first.
- Task priority: None, Low, Medium or High, with a coloured frame on the task, a priority filter, a “By priority” view and Top priorities on Today. Change it right from the task details.
- Settings are now defaults: each event or task can choose its own reminder, and new tasks start with your chosen “done” and overdue updates.
- On tablets and laptops the side menu shows your 5 chosen places and More; titles in details are underlined neatly under the last word.

## 1.14.1 · 2026-11-06

- Telegram messages are tidy: a bold header, short sections and one bullet per item, for /today, the AI’s answers and lists.
- Daily summary on Telegram: choose a time in Settings → Accounts & connections → Telegram and get your calendar, tasks (important first), anything overdue, shopping and approvals each morning. It arrives even during quiet hours.

## 1.14.0 · 2026-11-05

- Repeating tasks and events can end on a date, and repeat monthly or yearly. Every task and event shows who created it and when.
- Ask to hear when someone finishes your task, or to alert you and the assignee if it isn’t done in time. Telegram tells you too, with a Done button.
- After saving, the new task or event opens right where it was added.
- A new Shopping page: one place to add items, lists you can see and switch clearly, compact rows, and Hebrew and English item names recognised with the right picture and category.
- Calendar cards with one tidy layout, clearer today highlight, and details in a centred pop-up on tablets.
- Picking people works the same everywhere, and the selected person is clearly marked. Sharing looks the same in every editor.
- Tablets: a slim menu with your 5 chosen places (Settings › Quick menu) and More for the rest.
- Expenses: a cleaner toolbar with one Add button, amounts that always fit, and restaurants from RiseUp correctly shown as Eating out.

## 1.13.1 · 2026-11-05

- Shared expenses (RiseUp and imported statements set to “Both parents”) are now visible to every adult in the home, including a partner who joined after they were connected.

## 1.13.0 · 2026-11-05

- Telegram is now a full home assistant: just write, speak or send a photo to add, complete, move, edit or delete tasks, events, shopping items and notes, add expenses, or ask what you spent. Every change waits for Apply and can be undone.
- A full “/” menu in Telegram: /today, /tasks and /shopping with tap-to-complete, /week, /lists, /note and /expenses. It appears on its own; no need to reconnect.
- Ask AI in the app can now complete, move, edit and delete existing items too, and knows task lists, subtasks and anytime tasks.

## 1.12.0 · 2026-11-05

- Calendar: one tidy filter row, a new Agenda list with Add on every day, a clearer Month view with dots on phones, and Edit and Delete together in event details.
- Delete anything you created — tasks, events, notes, shopping items and lists, pantry, expenses, bills, meals, maintenance — with a button or by swiping a row, and Undo right after.
- iPhone landscape: a compact top and bottom bar instead of the sidebar, and a tidy menu with equal buttons.

## 1.11.0 · 2026-11-05

- On phones, Tasks, Calendar and Kids use one People button instead of a long row of names: it shows everyone’s faces, or the person you chose, and opens a sheet to pick someone.

## 1.10.1 · 2026-11-05

- On Today and in the Home journal, the faces of the people involved now sit on their own line under the title.

## 1.10.0 · 2026-11-05

- Cards with several people show overlapping faces with a +N, on Today, Calendar, Journal, Shopping and task lists.
- No scrollbars on phones and on sideways strips: a soft fade shows there is more to swipe.
- Task rows line up like a table, and the selected person chip gets a clean ring around the photo.

## 1.9.0 · 2026-11-05

- A new Tasks page: shared task lists (only me, family or selected people), filters for today, this week, upcoming, a day, a person or done, tasks grouped by day, subtasks, and tasks with no date.
- Plan a shopping trip from any shopping list. It shows up in Tasks and Today with how much is in the bag, and completes when everything is bought.
- A friendlier date picker everywhere, a richer Home journal with the latest entries first, a bigger family photo in the menu, a sun for Today, and a button to collapse the menu.
- Kids: name chips like the calendar and a pixel-block XP bar.

## 1.8.0 · 2026-11-05

- A new opening screen and sign-in in the Bayit sunrise style, a tablet menu that fits without scrolling with Menu size that really changes spacing, AI provider logos, and friendly pixel helpers on empty lists.

## 1.7.0 · 2026-11-05

- Take photo: on phones and tablets, use the camera to add a document, the family photo, a profile photo or an image.
- Camera pictures are made smaller before upload, so they are quick to save and stay readable.
- Run Bayit anywhere: besides Cloudflare, Bayit now also runs with Docker on a home computer, NAS, Raspberry Pi or any cloud server, using the same code (see the self-hosting guide).
- All your connections in one place: Settings → Accounts & connections shows Google, storage, AI, Telegram and RiseUp with live status, and sets each one up.
- Today’s task list now matches the Tasks screen: icon, owner, repeats and XP, and a tap opens the task.
- Loading screens now show a soft skeleton of the page instead of “Loading…” text, and opening your home shows a centred message.

## 1.6.0 · 2026-11-05

- Optional RiseUp connection: if you use RiseUp, Bayit reads your bank and card transactions from it every day (read-only), with step-by-step setup in Household → Expenses. Only you or both parents see them, as you choose, and imported statements are not counted twice.
- Money is now called Expenses, and shows your live bank balance when RiseUp is connected.
- Clearer navigation everywhere: section tiles, view switches with counts, and small filter chips. Add by hand is now a button.
- New pixel-art celebrations when you add or finish things, a ringing bell and a save badge, with Calm, Playful or Party in Settings → Animations & celebrations.

## 1.5.0 · 2026-11-05

- Choose your AI: Claude, OpenAI (including Codex models), Google Gemini, xAI Grok, or any OpenAI-compatible service, in Settings → AI.
- Eight grown-up pixel characters, including a grandma and grandpa. Parents can show a character, a photo or an icon.
- The character picker has Grown-ups and Kids groups.

## 1.4.0 · 2026-11-05

- Money is clearer: a monthly summary, tappable categories with every purchase inside, and fixed bills with due dates.
- New Today widgets: Money this month and Coming up: bills, plus an Add widget tile.
- Share Bayit with friends on WhatsApp, Telegram or email (Settings → Family).
- Each Household tab now explains what it is for; Expenses is now called Money.

## 1.3.0 · 2026-11-05

- Money: import Bank Leumi and Max statements (PDF) in the app or through Telegram. Every total is checked against the statement, card charges are not counted twice, and you see income, spending, savings, recurring bills, a next-month forecast and optional tips from Claude.
- Eight pixel characters for children (and anyone who likes them), each with the cap and moon cape.
- Add a profile with a character or a photo, and a birthday.
- Birthdays appear in the family calendar every year, with the age shown in the profile.
- The family photo card is aligned on phones.

## 1.2.0 · 2026-11-05

- Eight full color themes that change the background, cards, menu and buttons, in day and night.
- Clearer Colors & appearance settings: theme previews, light, tinted or deep menu, and button color swatches.
- A new phone menu that fits on one screen, with large section tiles.
- The family photo and name line up neatly in the menu.

## 1.1.1 · 2026-11-05

- Refined family menu, separate family photo editing, profile alignment, text sizes and white logos on dark sidebars.
- Explicit viewing and editing permissions, with private notes, calendar and tasks in My Space.
- Expanded Pantry, Expenses, Bills and Maintenance workflows.
- Child invitations can link existing profiles while retaining routines and progress.
- AI source cards, optional browser dictation and improved phone and tablet layouts.

## 1.1.0 · 2026-11-05

- Telegram: connect your own family bot for reminders with Done and Snooze buttons, a morning summary, and Claude chat that understands text, photos and voice messages.
- Saving is reliable on iPhone: photos are compressed, and one refused change can no longer block later ones.
- You only see “saved” after the household server confirms it. Otherwise you see what went wrong.
- Simpler phone forms: the icon picker sits next to the name, Save stays at the bottom, and fields no longer zoom or overlap.
- Calendar events line up with their day on every screen size.
- Version and update check in Settings.
- Title rays stay with the last word when a title wraps, and mirror in Hebrew.
- Calendar portraits have a ring and soft shadow so they stand out.

## 1.0.0 · 2026-11-04

- First family release: Today, calendar, tasks, shopping lists, journal, kids, household, statistics and Claude.
