# Firebase setup and operations

Survey responses hold **personal data** (name, department, student ID, phone).
Clients can create responses but can't read them. Only allowlisted admins can read them.

## Resources

| Item | Value |
| --- | --- |
| Project ID | `champus-booth` (Spark plan, no billing, no organization) |
| Web app | `champus-booth-web` (config: `firebase apps:sdkconfig WEB --project champus-booth`) |
| Firestore | `(default)`, Native mode, `asia-northeast3` (Seoul) |
| Auth | Google sign-in provider |
| Authorized domains | `localhost`, `champus-booth.firebaseapp.com`, `champus-booth.web.app`, `champus-halloween.vercel.app` |

The web SDK config is public by design. Access control comes from `firestore.rules`.

### Browser API key restrictions

The web API key ("Browser key (auto created by Firebase)") is limited in two ways. Change both in Google Cloud console > APIs & Services > Credentials.

- **API restrictions:** Firebase's default list of 27 APIs, including Firestore, Identity Toolkit and Secure Token. Leave it as it is.
- **Application restrictions (HTTP referrers):**
  - `https://champus-halloween.vercel.app/*`
  - `https://champus-booth.firebaseapp.com/*` (Google sign-in popup handler; keep it)
  - `https://champus-booth.web.app/*`
  - `http://localhost:5173/*`, `http://127.0.0.1:5173/*` (Vite dev)
  - `http://localhost:4173/*`, `http://127.0.0.1:4173/*` (Vite preview)

Notes:

- Port wildcards such as `http://localhost:*/*` are not honored. List each port explicitly.
- Any other origin is refused, including Vercel preview URLs and requests with no referer. Add the origin here first if one is needed.
- Firestore doesn't check the API key, so these restrictions protect Auth and the other key-checked APIs. Firestore data is protected by `firestore.rules`.
- To verify a change, call `GET https://identitytoolkit.googleapis.com/v1/projects?key=<key>` with a `Referer` header. An allowed origin returns 200, and any other origin returns 403 "Requests from referer … are blocked". Changes take effect within a few minutes.

## Files

- `firebase.json`: Firestore and emulator config
- `.firebaserc`: default project
- `firestore.rules`: security rules (the data contract is enforced here)
- `firestore.indexes.json`: indexes (defaults only; the purge query uses the automatic single-field index on `expireAt`)
- `test/rules/`: emulator test suite for `firestore.rules`, a self-contained package

## Data contract (`responses/{autoId}`)

The 13 contract fields are required, `consent` and `gender` are optional, and no other fields are allowed. See `firestore.rules` for the exact checks.
The client must:

- set `createdAt` to `serverTimestamp()`. A client clock value is rejected.
- set `expireAt` to a `Timestamp` about 365 days after now. The rules accept now + 364d to now + 366d.
- send `schemaVersion: 1`. `consent` may be omitted (the consent screen was removed); if it is sent, it must be `true`.
- send `gender` as `'male'` or `'female'`. The survey requires it, but the rules accept its absence so older clients keep working during rollout.
- set `activityOther` to a 1–100 character string when `'other'` is in `activities`, and to `null` otherwise.
- not repeat entries in `activities` or `days`.

No client can update a response. Only an admin can delete one, and only after its `expireAt` has passed.

## Analytics sessions (`sessions/{sid}`)

These are anonymous funnel counters, one document per visit, with no personal data. Anyone can create a session and move it forward. Only admins can read sessions, and an admin can delete one only after its `expireAt` has passed.

- **Doc ID:** `sid` is exactly 20 characters `[A-Za-z0-9]`. A Firestore auto-ID fits.
- **Fields:** all 15 are required, and no others are allowed.
  - `schemaVersion` (1)
  - timestamps: `startedAt`, `updatedAt`, `expireAt`
  - `lastScreen` (`s0`–`s10`, `s3_1`, `l1`–`l11`)
  - steps: `maxSurveyStep` and `maxLessonStep`, ints 0–11
  - booleans: `lessonCompleted`, `submitted`
  - counters: `lessonRestarts`, `submitAttempts`, `submitFailures`, ints 0–500
  - count maps, ints 0–500 per entry:
    - `infoOpens` and `infoSelects`: keys are a subset of the 10 real activity ids (no `undecided`/`other`)
    - `instagramClicks`: keys are a subset of `done`, `lessonEnd`
- **Create:** one `setDoc` without merge, carrying all 15 fields.
  - `startedAt` and `updatedAt` are `serverTimestamp()`.
  - `expireAt` is a client `Timestamp` set to now + 365d. The rules accept 364–366d.
  - Values only have to be in range. A create may already carry progress, because the client falls back to create when an update is denied.
- **Update:** `setDoc(..., { merge: true })` with every field except `startedAt` and `expireAt`. Values are absolute and `updatedAt` is `serverTimestamp()`.
  - `schemaVersion`, `startedAt` and `expireAt` can't change.
  - No field or map key may be removed or added. Map keys from the allowed set are the only exception: they may be added.
  - Steps, counters and map values never decrease.
  - `submitted` and `lessonCompleted` never go from true to false.
  - `lastScreen` may move in either direction.
- **Rules cost:** rules may evaluate at most 1,000 expressions per request. Updates therefore check only the fields and map entries that changed.
  - One update can change all 20 activity-map entries if nothing else changes, or 12 of them alongside every other field.
  - Real writes change 1–3 values.

## Admins

- An admin signs in with Google. The account's email must be verified, which is always the case for Google accounts.
- The allowlist is the `admins` collection. The document ID is the admin's **lowercase email** and the content is e.g. `{ role: "admin" }`.
- Clients can't write to `admins`. A signed-in user can only `get` the document for their own email, which is how the app checks admin status.
- To add or remove an admin, go to Firebase console > Firestore > `admins` and add or delete the document. Console and Admin SDK access bypass the rules.

## Retention (1 year)

The project runs on the free Spark plan with no billing, so there is **no TTL policy** (TTL requires Blaze).

Expired responses are purged by the admin page instead. When it opens, it queries `responses` where `expireAt < now` and deletes the results. `sessions` has the same expired-only admin delete rule, so it can be purged the same way. The rules allow `delete` only for an admin, and only when `resource.data.expireAt < request.time`. Even a buggy client can't delete an unexpired response.

Deletion therefore happens the next time an admin opens the page after expiry. If nobody opens it for a long time, an admin can also delete expired documents in the Firebase console.

## Deploy

```sh
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Before deploying with `--force`, make sure `firestore.indexes.json` still lists every index and override you need. `--force` deletes the ones it doesn't list. Do not exempt `expireAt` from indexing: the purge query needs it.

The Google provider was enabled with `firebase deploy --only auth`, using a temporary config that held the OAuth support email. That block is deliberately not committed. Change provider settings in the console: Authentication > Sign-in method.

To serve the site from a new domain, add it under Authentication > Settings > Authorized domains.

## Test rules locally

The emulator needs Java 11 or later. The suite is offline: it uses the demo project `demo-champus` and never touches production.

```sh
cd test/rules
npm install
npm test
```

`test/rules/firestore.rules.test.mjs` holds 238 allow/deny cases covering:

- responses: creates, reads, update, delete and the expired-only purge
- sessions: the web app's create and merge-update pattern, every monotonic violation, keys and types, caps, heavy updates, admin-only reads and the expired-only delete
- the `admins` allowlist and the default deny

Run it before every rules deploy.

## Ownership

The project belongs to the club's own personal Google account, with no organization, so that access doesn't depend on any one student's university account. The club account is **Owner**. Helpers get **Editor**, which can be granted directly.

Granting Owner to another person needs an invitation: Google Cloud console > IAM & Admin > IAM > Grant access > role Owner. The invitee must then accept the email invitation.

An earlier project, `champus-halloween`, was created inside a university Workspace organization. It has been deleted and must not be reused.
