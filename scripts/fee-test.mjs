// node scripts/fee-test.mjs
//
// The money arithmetic the collection counter shows, checked without a
// browser or a database.
//
// Almost all of the fee logic lives in SQL now, and is driven end to end by
// the probe that runs with the migrations. One piece cannot: the split a
// cashier is shown BEFORE the payment is saved. That has to be computed in
// the browser, which means the same oldest-first rule exists in two places --
// allocate() here and collect_fee() in migration 030.
//
// Two implementations of one rule is a liability. The mitigation is that the
// database is the one that decides, and this is only a preview; the other is
// that the preview is a pure function, so its behaviour can be pinned down
// here rather than discovered at a counter with a parent waiting.
//
// The panel is a client component with React imports node knows nothing
// about, so the one function is lifted out of the source and loaded on its
// own -- the same trick access-test.mjs uses for the `@/` alias.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const source = await readFile(
  path.join(root, 'app', 'school', 'fees', 'collect', 'payment-panel.js'),
  'utf8'
)

const start = source.indexOf('export function allocate')
const end = source.indexOf('\n}', start)
if (start === -1 || end === -1) {
  console.error('allocate() could not be found in payment-panel.js')
  process.exit(1)
}

const { allocate } = await import(
  'data:text/javascript;charset=utf-8,' +
    encodeURIComponent(source.slice(start, end + 2))
)

let failures = 0
function check(name, condition) {
  if (condition) {
    console.log('  ok   ' + name)
  } else {
    failures += 1
    console.log('  FAIL ' + name)
  }
}

// Five months unpaid, oldest first, which is the case the whole design is for.
const arrears = [
  { id: 'jun', outstanding: 5000 },
  { id: 'jul', outstanding: 5000 },
  { id: 'aug', outstanding: 5000 },
  { id: 'sep', outstanding: 5000 },
  { id: 'oct', outstanding: 5000 },
]

console.log('\nthe split a cashier is shown')

{
  const { rows, credit } = allocate(0, arrears)
  check('nothing typed allocates nothing', rows.length === 0 && credit === 0)
}

{
  const { rows, credit } = allocate(5000, arrears)
  check('one month pays the oldest month', rows.length === 1 && rows[0].id === 'jun')
  check('one month clears that bill', rows[0].clears === true)
  check('one month leaves no change', credit === 0)
}

{
  const { rows, credit } = allocate(12000, arrears)
  check('twelve thousand touches three bills', rows.length === 3)
  check('it clears the first two', rows[0].clears && rows[1].clears)
  check('it part-pays the third', rows[2].pay === 2000 && rows[2].clears === false)
  check('a part payment leaves no change', credit === 0)
}

{
  const { rows, credit } = allocate(25000, arrears)
  check('the exact total clears every bill', rows.length === 5 && rows.every((r) => r.clears))
  check('the exact total leaves no change', credit === 0)
}

{
  // The question the user actually asked: three pendings and two months ahead,
  // paid together. The bills are cleared and the surplus is held, not lost.
  const { rows, credit } = allocate(32000, arrears)
  check('paying over the total still clears every bill', rows.length === 5)
  check('the surplus is held as advance', credit === 7000)
  check(
    'the allocated part equals what was handed over, less the advance',
    rows.reduce((sum, r) => sum + r.pay, 0) === 25000
  )
}

{
  const { rows, credit } = allocate(4000, [{ id: 'a', outstanding: 0 }, ...arrears])
  check('a bill with nothing owing is skipped', rows.length === 1 && rows[0].id === 'jun')
  check('skipping it does not consume the money', rows[0].pay === 4000 && credit === 0)
}

{
  const { rows, credit } = allocate(3000, [])
  check('with no bills at all, everything is advance', rows.length === 0 && credit === 3000)
}

{
  // Defensive: the amount arrives from an <input>, so it can be anything.
  check('a blank amount is treated as nothing', allocate('', arrears).rows.length === 0)
  check('a non-number is treated as nothing', allocate('abc', arrears).credit === 0)
  check('a negative amount allocates nothing', allocate(-500, arrears).rows.length === 0)
}

{
  // Rupees and paisa. A school billing 1,666.67 three times should not leave
  // a stray paisa behind that shows the bill as unpaid.
  const thirds = [
    { id: 'a', outstanding: 1666.67 },
    { id: 'b', outstanding: 1666.67 },
    { id: 'c', outstanding: 1666.66 },
  ]
  const { rows, credit } = allocate(5000, thirds)
  check('fractional bills are all cleared by the exact total', rows.length === 3)
  check('fractional bills leave no residue', Math.abs(credit) < 0.005)
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
