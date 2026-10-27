// node scripts/date-test.mjs
//
// The school's own "today", checked without a browser or a database.
//
// This exists because the dashboard's every figure now hangs off these three
// functions. Get the day boundary wrong by an hour and the fee counter shows
// yesterday's takings, the register reports an empty school, and nothing on
// the screen looks broken enough for anybody to notice.
//
// The cases below are the ones that are wrong by default: a server in UTC
// serving a school that is not, the two days a year that are 23 and 25 hours
// long, and a day that is also a month boundary.
//
// lib/appearance.js is Next source -- plain ESM with no imports of its own,
// so unlike lib/access.js it loads straight from disk.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const lib = pathToFileURL(path.join(here, '..', 'lib', 'appearance.js')).href

const { dayKey, dayRange, monthStartKey } = await import(lib)

let failures = 0
function check(name, got, want) {
  if (got === want) {
    console.log('  ok   ' + name)
  } else {
    console.log(`  FAIL ${name}\n         got  ${got}\n         want ${want}`)
    failures += 1
  }
}

const at = (iso) => new Date(iso)
const KHI = { timezone: 'Asia/Karachi' }
const NYC = { timezone: 'America/New_York' }

/* ------------------------- a UTC server, a school five hours ahead ------ */

// 08:00 in Karachi. The server's own date agrees here, so this is the easy
// half and only proves the zone is being read at all.
check('morning in Karachi', dayKey(at('2026-10-20T03:00:00Z'), KHI), '2026-10-20')

// 01:00 the NEXT day in Karachi, while the server is still on the 20th. This
// is the case that put a whole evening's receipts on the wrong day.
check('after midnight in Karachi', dayKey(at('2026-10-20T20:00:00Z'), KHI), '2026-10-21')

const evening = dayRange(at('2026-10-20T20:00:00Z'), KHI)
check('that evening starts at 19:00Z', evening.start, '2026-10-20T19:00:00.000Z')
check('and ends 24h later', evening.end, '2026-10-21T19:00:00.000Z')

/* ---------------------------------------------- the two odd-length days - */

// Spring forward: local midnight to local midnight is 23 hours, not 24. A
// single offset measured at UTC midnight gets the far end an hour wrong.
const short = dayRange(at('2026-03-08T07:30:00Z'), NYC)
check('spring-forward day starts', short.start, '2026-03-08T05:00:00.000Z')
check('spring-forward day is 23h', (Date.parse(short.end) - Date.parse(short.start)) / 3600000, 23)

// Fall back: 25 hours, and the same measurement goes wrong the other way.
const long = dayRange(at('2026-11-01T06:30:00Z'), NYC)
check('fall-back day starts', long.start, '2026-11-01T04:00:00.000Z')
check('fall-back day is 25h', (Date.parse(long.end) - Date.parse(long.start)) / 3600000, 25)

/* ------------------------------------------------- rolling over a month - */

// 00:00 on 1 February in Karachi, while the server says 31 January.
check('month rollover', dayKey(at('2026-01-31T23:00:00Z'), KHI), '2026-02-01')
check('month start follows it', monthStartKey(at('2026-01-31T23:00:00Z'), KHI), '2026-02-01')
check(
  'the last day of a month still ends',
  dayRange(at('2026-01-31T10:00:00Z'), KHI).end,
  '2026-01-31T19:00:00.000Z'
)

/* ------------------------------------------------------ a settings typo - */

// An unknown zone makes Intl throw, which on a server component means the
// whole dashboard 500s. It has to fall back instead -- to the host's zone,
// whatever that is, rather than to an exception.
const typo = dayRange(at('2026-10-20T03:00:00Z'), { timezone: 'Not/AZone' })
check('a bad zone still yields a day', typeof typo.day, 'string')
check('a bad zone still yields a range', Number.isFinite(Date.parse(typo.start)), true)
check('no zone at all is fine', typeof dayRange(at('2026-10-20T03:00:00Z')).day, 'string')

/* ---------------------------------------------------- the range is sound */

// Half-open, always: a payment taken at exactly midnight has to land in the
// day starting, counted once.
const today = dayRange(at('2026-10-20T03:00:00Z'), KHI)
check('start is before end', Date.parse(today.start) < Date.parse(today.end), true)
check(
  'the day it names is the day it bounds',
  dayKey(new Date(Date.parse(today.start) + 1000), KHI),
  today.day
)
check(
  'the end instant belongs to the next day',
  dayKey(new Date(today.end), KHI) !== today.day,
  true
)

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
