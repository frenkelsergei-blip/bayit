# Bayit implementation rules

Visual reference: docs/images/hero-direction.jpg (selected direction), the module renders in docs/images, and docs/images/today-dark.jpg for night mode.

Keep the cream/cobalt/navy/yellow identity, heavy rounded typography, spacious hierarchy, actual image assets and native Hebrew RTL / English LTR. Use design-system/tokens.json and local licensed font files. Do not restyle the product into a generic dashboard.

Use real generated PNG assets and OpenMoji/Phosphor icons. Never replace brand, portraits or pixel art with emoji, handcrafted SVG, CSS drawings or generic placeholders. Preserve asset licenses and attribution.

Every note/task/event has an owner and visibility: private, family or selected people. Parent activity management does not expose someone else's private notes. AI, suggestions, statistics and notification previews must use the same access rules.

Each installation supplies its own AI credentials and Telegram bot. Recipients start their own linked bot. Do not store actual API keys in frontend state, logs or this repository. Connection demos must never pretend a live test succeeded.

The local demo (?demo=1) uses fictional data. Production authentication, server authorization, credential encryption and delivery adapters are separate implementation gates documented in docs. Do not describe frontend filtering as production data security.

Light/night and responsive desktop/tablet/phone are mandatory. Day/night changes semantic tokens, not content ownership or layout. Verify changes in a browser (phone, tablet and desktop; Hebrew and English; light and night) before opening a pull request.


Review refinements confirmed by the user on 2026-11-04:
- The selected concept is the visual contract for each module. Rebuild missing anatomy and workflows; palette alone is insufficient.
- Title underline and three rays attach to the final word or short final phrase, including wrapping and RTL. Use the real generated title assets.
- Default grocery and routine icons use the curated refined PNG collection. The large official icon catalog remains available for custom choices.
- Selected task rows must preserve their geometry. Timeline dots center on their rail. Sharing choices stay visible without horizontal scrolling.
- Shopping supports editing icon/category/quantity/unit/assignee, remaining-items filtering, clear add fields and preserved list state.
- Kids includes schedulable routines, weekday/time/reward/approval/turn settings, history and equipped accessories shown on every character surface. Animation is a later increment.
- Family creation, photos/personal icons, four color palettes and configurable Today widgets are requested. Each installation owns its storage/AI/Telegram credentials. Do not claim a live Google login or cloud sync until verified.

Review updates on 2026-11-04, evening:
- Standard text is 85% of the original implementation; expose it as the new 100%. Menu text has its own size adjustment.
- Group palette, accent, day/night background and sidebar controls under Colors & appearance. Neutral night surfaces retain the chosen palette accent. Accessibility is a separate named category.
- Profile personal-icon control is compact, aligned and clearly labeled. Family image uses a subtle border and soft shadow.
- Shopping category management must be visible near the top; history-based suggestions advance after adding a product and never suggest a current unchecked duplicate.
- Statistics must match the reference anatomy and density, including three aligned filters, full-width tabs, labeled rounded cobalt bars, compact member/XP rows and aligned task rankings. Heat map is optional and must not displace the reference layout.

- All page headers reserve the same physical top-right utility corner for the notification bell and future utility icons. Page actions sit below the header; no date, sample badge, or other page-specific extras in that corner. Mobile uses the existing top-bar bell in the same physical right corner, including RTL.

Latest concept review (2026-11-05):
- Family/account menus must open in a viewport-bounded popover outside the collapsed tablet rail. Family portrait, name and disclosure arrow align on their vertical centers; the family portrait has an obvious edit entry point and is separate from the Google account photo.
- Center the actual Bayit logo in all sidebar widths. The complete logo is white on dark/navy/charcoal sidebar surfaces, including day mode with a dark sidebar. Today and Household use visibly different navigation icons.
- Remove the EN/Hebrew switch from the application sidebar. Language is a per-profile preference in Settings/Profile and persists across signed-in devices. Offer text sizes 80, 90, 100, 110, 120 percent relative to the new standard.
- Profile portrait and edit badge must share one measured responsive box; avoid excessive selected-profile blue blocks, huge name text, and controls drifting at smaller/larger text sizes.
- Shopping mutations use compact outlined/filled icon buttons; reserve link styling for navigation and source references.
- Calendar portrait chips protrude slightly beyond the pill, and the event-title underline is a clean real generated PNG, matching the title accent rather than a flattened noisy graphic.
- Surface Privacy & permissions explicitly, including distinct view/edit choices for events and notes, backed by server checks. My Space is a dedicated private notes/calendar/tasks hub, not a duplicate family timeline.
- Audit all module concepts, including AI source cards/connections, Kids screens and Household pantry/expenses/maintenance, with real functional controls and honest integration status. Dictation is optional, user-initiated, leaves text for review, and falls back to keyboard dictation when unsupported.

Review updates on 2026-11-05:
- A change is "saved" only after the household server confirms it. A refused change must be reported and undone, and must never block later changes. Photos stay small (JPEG); do not rely on WebP canvas encoding, because iPhone Safari returns PNG.
- Phone forms keep Save reachable (sticky bar above the tab bar), put the icon choice next to the name, use fields of at least 16px on touch, use one soft focus ring, and keep date/time fields from overlapping. Phone, tablet and desktop may use different layouts; tablet details open in a sheet.
- Calendar events align with their day row on every breakpoint.
- Settings → About & updates shows the app version (package.json) and build, checks for updates, and offers "Update now". Bump the version and add release notes for each release.
- Several agent sessions (Claude and Codex) may edit this folder at the same time without git. Use small exact-match edits to shared files, never rewrite whole shared files, and put new page CSS in its own stylesheet.

Review updates on 2026-11-05 (menu and themes):
- Themes change the whole look (background, cards, menu, buttons) in day and night, not only the accent. Settings shows visual theme previews, menu color (Light/Tinted/Deep), night background and button color.
- The phone menu is a one-screen bottom sheet with section tiles. Do not reuse the tall desktop sidebar as the phone drawer.
- The family photo, name and arrow share one vertical center everywhere the family card appears.
- Every member can choose a photo, a personal icon or one of eight pixel characters (each character has cap and cape outfits and a bust). New characters must come with all outfit variants. A birthday on a profile can add a yearly family-calendar event; it uses the same visibility rules as other events.
