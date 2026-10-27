// Dry-run a migration against the linked Supabase project.
//
// The whole thing is wrapped in BEGIN ... ROLLBACK, so nothing it does
// survives. That is safe here for a reason we have evidence for: the failed
// runs of this same file left no trace at all -- profiles.is_school_admin did
// not exist afterwards -- which means the endpoint already runs a file as one
// transaction and aborts it on error. This just makes the abort deliberate.
//
// Several files run as ONE transaction, in the order given. That is the point:
// a migration and the probe that drives its new functions have to share a
// transaction, or the probe would be testing a database the migration never
// touched.
//
// Usage: node dry-run-migration.mjs <path-to-sql> [more.sql ...]
import { readFile } from 'node:fs/promises'

const ref = 'pwoqjsfijupilqyzlzoq'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set')
  process.exit(1)
}

const paths = process.argv.slice(2)
if (!paths.length) {
  console.error('usage: node dry-run-migration.mjs <path-to-sql> [more.sql ...]')
  process.exit(1)
}

const parts = []
for (const path of paths) {
  parts.push(`-- >>>>> ${path}`)
  parts.push(await readFile(path, 'utf8'))
}
const wrapped = `BEGIN;\n\n${parts.join('\n\n')}\n\nROLLBACK;`

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: wrapped }),
})

const text = await res.text()

if (!res.ok) {
  console.log(`DRY RUN FAILED (${paths.join(' + ')})\n`)
  try {
    const err = JSON.parse(text)
    console.log(err.message ?? text)
  } catch {
    console.log(text)
  }
  process.exit(1)
}

console.log(`DRY RUN CLEAN (${paths.length} file${paths.length === 1 ? '' : 's'}) — every statement planned and executed, then rolled back\n`)
try {
  const rows = JSON.parse(text)
  if (Array.isArray(rows) && rows.length) {
    console.log(JSON.stringify(rows, null, 2).slice(0, 3000))
  }
} catch {
  console.log(text.slice(0, 500))
}
