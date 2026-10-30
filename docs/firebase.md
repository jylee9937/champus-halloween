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

## Files

- `firebase.json`: Firestore and emulator config
- `.firebaserc`: default project
- `firestore.rules`: security rules (the data contract is enforced here)
- `firestore.indexes.json`: indexes (defaults only; the purge query uses the automatic single-field index on `expireAt`)

## Data contract (`responses/{autoId}`)

All 14 fields are required, and no other fields are allowed. See `firestore.rules` for the exact checks.
The client must:

- set `createdAt` to `serverTimestamp()`. A client clock value is rejected.
- set `expireAt` to a `Timestamp` about 365 days after now. The rules accept now + 364d to now + 366d.
- send `schemaVersion: 1` and `consent: true`.
- set `activityOther` to a 1–100 character string when `'other'` is in `activities`, and to `null` otherwise.
- not repeat entries in `activities` or `days`.

No client can update a response. Only an admin can delete one, and only after its `expireAt` has passed.

## Admins

- An admin signs in with Google. The account's email must be verified, which is always the case for Google accounts.
- The allowlist is the `admins` collection. The document ID is the admin's **lowercase email** and the content is e.g. `{ role: "admin" }`.
- Clients can't write to `admins`. A signed-in user can only `get` the document for their own email, which is how the app checks admin status.
- To add or remove an admin, go to Firebase console > Firestore > `admins` and add or delete the document. Console and Admin SDK access bypass the rules.

## Retention (1 year)

The project runs on the free Spark plan with no billing, so there is **no TTL policy** (TTL requires Blaze).

Expired responses are purged by the admin page instead. When it opens, it queries `responses` where `expireAt < now` and deletes the results. The rules allow `delete` only for an admin, and only when `resource.data.expireAt < request.time`. Even a buggy client can't delete an unexpired response.

Deletion therefore happens the next time an admin opens the page after expiry. If nobody opens it for a long time, an admin can also delete expired documents in the Firebase console.

## Deploy

```sh
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Before deploying with `--force`, make sure `firestore.indexes.json` still lists every index and override you need. `--force` deletes the ones it doesn't list. Do not exempt `expireAt` from indexing: the purge query needs it.

The Google provider was enabled with `firebase deploy --only auth`, using a temporary config that held the OAuth support email. That block is deliberately not committed. Change provider settings in the console: Authentication > Sign-in method.

To serve the site from a new domain, add it under Authentication > Settings > Authorized domains.

## Test rules locally

```sh
npx -y firebase-tools@latest emulators:start --only firestore
```

Point `@firebase/rules-unit-testing` at `127.0.0.1:8080` with the contents of `firestore.rules`. The rules were verified against 97 allow/deny cases: valid and invalid creates, reads by anonymous users, non-admins, unverified accounts and admins, update, the expired-only admin delete (single and batched), and the allowlist.

## Ownership

The project belongs to the club's own personal Google account, with no organization, so that access doesn't depend on any one student's university account. The club account is **Owner**. Helpers get **Editor**, which can be granted directly.

Granting Owner to another person needs an invitation: Google Cloud console > IAM & Admin > IAM > Grant access > role Owner. The invitee must then accept the email invitation.

An earlier project, `champus-halloween`, was created inside a university Workspace organization. It has been deleted and must not be reused.
