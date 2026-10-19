// node scripts/access-test.mjs
//
// The access rules, checked without a browser or a database.
//
// This exists because the switches in the access dialog went wrong twice in
// ways that were obvious on screen and invisible in the code: ticking one
// page wrote to every page in its section, and the dialog kept showing a
// stale sheet after a save. Both were pure-function bugs. So the pure
// functions now live in lib/access.js and this runs them.
//
// lib/access.js is Next source -- ESM, and it imports NAV through the `@/`
// alias, which node knows nothing about. Rather than restructure the app to
// suit a test, the one import is rewritten to a file URL and the module is
// loaded from memory.

import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const source = await readFile(path.join(root, 'lib', 'access.js'), 'utf8')
const navUrl = pathToFileURL(path.join(root, 'app', 'school', 'nav-items.js')).href
const rewritten = source.replace('@/app/school/nav-items', navUrl)

const { PAGES, accessFrom, applyToggle, seedSheet, setPages } = await import(
  'data:text/javascript;charset=utf-8,' + encodeURIComponent(rewritten)
)

let failures = 0
function check(name, condition) {
  if (condition) {
    console.log('  ok   ' + name)
  } else {
    console.log('  FAIL ' + name)
    failures += 1
  }
}

const attendance = PAGES.filter((p) => p.section === 'attendance')
const [student, staff, biometric, reports] = attendance
console.log(`attendance pages: ${attendance.map((p) => p.label).join(', ')}\n`)

/* ---------------- one switch changes its own page and no other ---------- */

let sheet = seedSheet(PAGES, [])
sheet = applyToggle(sheet, student.key, 'view', true)

check('student attendance is on', sheet[student.key].view === true)
check('staff attendance untouched', sheet[staff.key].view === false)
check('thumb attendance untouched', sheet[biometric.key].view === false)
check('attendance reports untouched', sheet[reports.key].view === false)

sheet = applyToggle(sheet, student.key, 'edit', true)
check('student attendance edit on', sheet[student.key].edit === true)
check('staff attendance edit still off', sheet[staff.key].edit === false)
check('reports still off', sheet[reports.key].view === false)

sheet = applyToggle(sheet, staff.key, 'view', true)
sheet = applyToggle(sheet, staff.key, 'view', false)
check('staff attendance back off', sheet[staff.key].view === false)
check('student attendance survived', sheet[student.key].view === true)
check('student attendance edit survived', sheet[student.key].edit === true)

/* ------------------------- the two couplings, both inside one row ------- */

let one = seedSheet(PAGES, [])
one = applyToggle(one, student.key, 'delete', true)
check('delete turns view on for that page', one[student.key].view === true)
one = applyToggle(one, student.key, 'view', false)
check('view off clears edit on that page', one[student.key].edit === false)
check('view off clears delete on that page', one[student.key].delete === false)

/* ------------------------------------------- what the group buttons do -- */

const grouped = setPages(seedSheet(PAGES, []), attendance, true)
check('select all fills the group', attendance.every((p) => grouped[p.key].view))
check(
  'select all leaves other groups alone',
  PAGES.filter((p) => p.section === 'students').every((p) => !grouped[p.key].view)
)

/* ------------------- stored rows -> switches, sidebar, database codes --- */

const stored = [
  { page: student.key, section: 'attendance', can_view: true, can_edit: true, can_delete: false },
]
const seeded = seedSheet(PAGES, stored)
check('a stored row shows on its page', seeded[student.key].edit === true)
check('and nowhere else', seeded[reports.key].view === false)

const { pages, permissions } = accessFrom(stored)
check('sidebar opens that page', pages.get(student.key).view === true)
check('sidebar hides the others', pages.get(reports.key) === undefined)
check('database is told read', permissions.has('attendance.read'))
check('database is told write', permissions.has('attendance.write'))
check('database is NOT told delete', !permissions.has('attendance.delete'))
check('nothing leaks into students', !permissions.has('students.read'))

/* ----------------------------------------- view-only means view only ---- */

const viewer = accessFrom([
  { page: student.key, section: 'attendance', can_view: true, can_edit: false, can_delete: false },
])
check('a viewer gets read', viewer.permissions.has('attendance.read'))
check('a viewer gets no write', !viewer.permissions.has('attendance.write'))
check('a viewer gets no delete', !viewer.permissions.has('attendance.delete'))

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
