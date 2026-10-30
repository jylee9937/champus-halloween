# Firebase setup and operations

Survey responses hold **personal data** (name, department, student ID, phone).
Clients can create responses but can't read them. Only allowlisted admins can read them.

## Resources

| Item | Value |
| --- | --- |
| Project ID | `champus-halloween` |
| Web app | `champus-booth-web` (config: `firebase apps:sdkconfig WEB --project champus-halloween`) |
| Firestore | `(default)`, Native mode, `asia-northeast3` (Seoul) |
| Auth | Google sign-in provider |
| Authorized domains | `localhost`, `champus-halloween.firebaseapp.com`, `champus-halloween.web.app`, `champus-halloween.vercel.app` |

The web SDK config is public by design. Access control comes from `firestore.rules`.

## Files

- `firebase.json`: Firestore and emulator config
- `.firebaserc`: default project
- `firestore.rules`: security rules (the data contract is enforced here)
- `firestore.indexes.json`: indexes. `responses.expireAt` is excluded from indexing because it is only used for TTL.

## Data contract (`responses/{autoId}`)

All 14 fields are required, and no other fields are allowed. See `firestore.rules` for the exact checks.
The client must:

- set `createdAt` to `serverTimestamp()`. A client clock value is rejected.
- set `expireAt` to a `Timestamp` about 365 days after now. The rules accept now + 364d to now + 366d.
- send `schemaVersion: 1` and `consent: true`.
- set `activityOther` to a 1–100 character string when `'other'` is in `activities`, and to `null` otherwise.
- not repeat entries in `activities` or `days`.

Responses can't be updated or deleted by any client.

## Admins

- An admin signs in with Google. The account's email must be verified, which is always the case for Google accounts.
- The allowlist is the `admins` collection. The document ID is the admin's **lowercase email** and the content is e.g. `{ role: "admin" }`.
- Clients can't write to `admins`. A signed-in user can only `get` the document for their own email, which is how the app checks admin status.
- To add or remove an admin, go to Firebase console > Firestore > `admins` and add or delete the document. Console and Admin SDK access bypass the rules.

## Retention (1 year)

Each response carries `expireAt`. A Firestore TTL policy on collection group `responses`, field `expireAt`, deletes expired documents. TTL deletion is not instant: it usually happens within about 24h after expiry.

TTL requires the **Blaze** (billing) plan. To enable it after upgrading, use either of these:

- Console: Firestore > Time-to-live > Create policy > collection group `responses`, timestamp field `expireAt`.
- Config: add `"ttl": true` to the `expireAt` override in `firestore.indexes.json`, then deploy indexes.

## Deploy

```sh
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Before deploying with `--force`, make sure `firestore.indexes.json` still lists every index and override you need. `--force` deletes the ones it doesn't list.

The Google provider was enabled with `firebase deploy --only auth`, using a temporary config that held the OAuth support email. That block is deliberately not committed. Change provider settings in the console: Authentication > Sign-in method.

## Test rules locally

```sh
npx -y firebase-tools@latest emulators:start --only firestore
```

Point `@firebase/rules-unit-testing` at `127.0.0.1:8080` with the contents of `firestore.rules`. The rules were verified against 85 allow/deny cases: valid and invalid creates, reads by anonymous users, non-admins, unverified accounts and admins, update/delete, and the allowlist.

## Ownership

The project was created inside a university Google Workspace organization. To keep it after the creating account goes away, the club account must hold the **Owner** role. External owners can only be added by invitation: Google Cloud console > IAM & Admin > IAM > Grant access > role Owner. The invitee must then accept the email invitation.
