# Optional event and task locations

Implemented locally for the combined 1.18.0 release. The approved concept is one flow: an inline location section in the editor, an address search sheet on smaller screens, and a compact map after selecting a result. Existing people pills retain the Calendar anatomy and circular portraits.

Every event/task can have an optional personal place name, such as “At Grandma Shoshana’s”. This works without Maps. A searched address is separate: choosing a suggestion adds an exact Google Place ID, then returns directly to the editor. Removing that address keeps the personal place name. An optional saved place uses the activity’s audience, including its task-list audience, and is saved atomically with the activity.

## Installation setup

1. Apply `app/cloud/migrations/0008_maps.sql` using the installation’s normal migration process before enabling Maps. Older databases produce `MAPS_SETUP_PENDING`; manual locations remain usable.
2. Configure the existing server credential encryption (`APP_ENCRYPTION_KEY`).
3. In the installation’s Google Cloud project, enable billing, Places API (New), and Maps Embed API. Create two distinct keys: a server key restricted to Places API (New), and a browser key restricted to Maps Embed API and the app’s website origins. Apply further server restrictions where the hosting environment supports them.
4. A parent opens Settings → Connections → Google Maps and submits both keys. Bayit makes a public-place autocomplete request before storing encrypted credentials. Failure leaves any previous connection unchanged. This verifies search only; use the explicit test-map action to inspect whether Google accepts the website key.

Ordinary Google sign-in does not configure Maps or create a separate quota for each family member. Embed usage and Places search have different billing rules; check the installation’s current Google pricing, quotas and budget settings. A provider refusal or limit does not remove manual text or the current draft. Configuration is optional.

Official setup and pricing sources, checked 2026-11-06: [Places setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key), [Embed setup](https://developers.google.com/maps/documentation/embed/get-api-key), [Places billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), [Embed billing](https://developers.google.com/maps/documentation/embed/usage-and-billing), [Places content and attribution](https://developers.google.com/maps/documentation/places/web-service/policies).

## Data and permissions

The record stores only `{label, address, placeId}`: manual text, the user’s typed search, and the selected ID. Provider formatted addresses and attributions are transient tab data, with no durable browser/provider-response cache. Coordinates, raw provider payloads and credentials are rejected as location fields. Provider details request only essential address/ID/attribution fields. Search is deliberately initiated, debounced, session-tokened, bounded and rate limited.

The Places key is never returned to the client. The Embed-only website key is used inside an isolated same-origin frame to request Google’s map; a browser map key is inherently browser-visible and must be restricted in Google Cloud. Status, React state, household record JSON and logs do not contain keys. Credential fields are uncontrolled and cleared after submission.

Locations and reusable places use the existing household server’s owner/view/edit checks. Record-backed address and embed requests recheck the visible original event/task/place before contacting Google. A copied link contains household and record IDs, optionally a date; it carries no title, address or access grant. Sign-in and household selection retain that original destination. Unknown/inaccessible links show an unavailable state and never substitute another event/task. Copying a link does not add recipients to an audience.

Disconnecting Maps keeps existing personal text and selected IDs. Reconnecting can restore previews. No connected results or test-success claims are shown in the standalone fictional demo.

## Verification

Evidence is in `work/qa/locations-20261106/` and `design-qa.md`. Domain/handler tests use actual state validators, SQLite and a loopback provider; browser interaction tests use clearly labeled fictional fixture responses. These are not live Google verification, real Google login, delivery to another person, or physical iPhone testing. Final production migrations, combined regression and deployment belong to the release coordinator.
