# whatsapp-gateway

Holds one linked WhatsApp session per school and sends on behalf of the school app.

## Why this is a separate process

A scanned session is a **WebSocket that WhatsApp expects to stay open**. It is not a
per-request credential like an SMTP login — there is no way to "reconnect per send"
without re-handshaking the whole Signal session, and doing that repeatedly is one of
the things that gets a number flagged.

So the socket lives here, in a process that stays up, and the Next.js app talks to it
over HTTP. That also means **this cannot run on Vercel or any serverless host.** It
needs a machine that stays on: a VPS, or the school's own PC.

It holds no database credentials and knows nothing about students or fees — only an
opaque school id, a phone number and some text. If this process is ever compromised,
what leaks is the ability to send messages, not the school's records.

## Running it

```bash
cd whatsapp-gateway
npm install
cp .env.example .env     # then fill in WHATSAPP_INGEST_TOKEN
npm start
```

`WHATSAPP_INGEST_TOKEN` must be the **same value** as in the app's `.env.local`. It is
minted by `supabase/migrations/027_whatsapp.sql` and printed once when that runs. If it
was lost, a platform admin can issue a new one with
`SELECT public.rotate_whatsapp_token();` — then update both files.

Keep it alive across reboots with pm2, systemd, or Windows Task Scheduler:

```bash
pm2 start server.js --name whatsapp-gateway
pm2 save && pm2 startup
```

## Linking a phone

In the app: **Communication → WhatsApp → Link a phone**, then on the handset open
WhatsApp → Settings → Linked devices → Link a device, and scan.

The scan is **one-time**. Credentials are written to `AUTH_DIR/<school-id>/` and
reloaded on boot, so restarting reconnects silently. The link only breaks if somebody
removes it from Linked devices on the phone, or if the phone stays offline long enough
for WhatsApp to drop it.

## The `auth/` folder is the session

Anyone holding `auth/<school-id>/` can send WhatsApp messages as that school. It is
gitignored. Back it up if you care about not re-scanning; secure it either way.

Deleting a school's folder is equivalent to tapping "Log out" on the phone.

## What it does not do

No database access, no templates, no recipient lists, no retry policy — all of that is
the app's job. This process holds sockets and moves text, and keeping it that boring is
what makes it safe to leave running.

## Protecting the number

This is not an API WhatsApp publishes, and the account can be banned. **Bursts trigger
that far more readily than volume.** Three guards, and they matter:

| Guard | Where | Default |
|---|---|---|
| Gap + jitter between sends | here, per session | 3s + up to 2s |
| Daily cap | app, per school | 500 |
| Quiet hours | app, per school | 21:00 – 07:30 |

Sends are serialised per school, so a batch of 400 leaves as a trickle over twenty-odd
minutes. That delay is the protection working, not something to tune away.

The gateway also checks each number is registered on WhatsApp before sending, so a
wrong number fails honestly instead of vanishing — sending into the void is itself a
spam signal.

## Endpoints

All require `Authorization: Bearer $WHATSAPP_INGEST_TOKEN` except `/health`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness, and every session's status |
| `GET` | `/sessions/:schoolId` | Status, and the QR as a data URL while pairing |
| `POST` | `/sessions/:schoolId/connect` | Open the socket; returns immediately |
| `POST` | `/sessions/:schoolId/logout` | Unlink and wipe the stored keys |
| `POST` | `/sessions/:schoolId/send` | `{ to, text }` |

Receipts, replies and session changes are pushed to `APP_URL/api/whatsapp/events`.

Bind to `127.0.0.1` unless the app runs on another machine. This must not face the
public internet.
