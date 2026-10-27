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

const {
  ALL_CODES,
  PAGES,
  PAGE_TREE,
  accessFrom,
  adminAccess,
  applyToggle,
  modulesFrom,
  seedSheet,
  setPages,
  toggleModule,
} = await import(
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

// Rule 1 is ANDed over rule 2, so every check below needs its modules on.
const allOn = PAGE_TREE.map((g) => ({ module: g.key, enabled: true }))

const { pages, permissions } = accessFrom(stored, allOn)
check('sidebar opens that page', pages.get(student.key).view === true)
check('sidebar hides the others', pages.get(reports.key) === undefined)
check('database is told read', permissions.has('attendance.read'))
check('database is told write', permissions.has('attendance.write'))
check('database is NOT told delete', !permissions.has('attendance.delete'))
check('nothing leaks into students', !permissions.has('students.read'))

/* ----------------------------------------- view-only means view only ---- */

const viewer = accessFrom(
  [{ page: student.key, section: 'attendance', can_view: true, can_edit: false, can_delete: false }],
  allOn
)
check('a viewer gets read', viewer.permissions.has('attendance.read'))
check('a viewer gets no write', !viewer.permissions.has('attendance.write'))
check('a viewer gets no delete', !viewer.permissions.has('attendance.delete'))

/* ------------- rule 1: a module switched off takes its pages with it ---- */

const attendanceModule = PAGE_TREE.find((g) => g.pages.some((p) => p.key === student.key))
const moduleOff = allOn.map((m) =>
  m.module === attendanceModule.key ? { ...m, enabled: false } : m
)

const blocked = accessFrom(stored, moduleOff)
check('module off hides the page', blocked.pages.get(student.key) === undefined)
check('module off withdraws read', !blocked.permissions.has('attendance.read'))
check('module off withdraws write', !blocked.permissions.has('attendance.write'))

const restored = accessFrom(stored, allOn)
check('module back on restores the page', restored.pages.get(student.key).view === true)
check('module back on restores write', restored.permissions.has('attendance.write'))
check('no module rows at all means nothing', accessFrom(stored, []).pages.size === 0)

let live = modulesFrom(allOn)
live = toggleModule(live, attendanceModule.key, false)
check('toggling a module off drops it', !live.has(attendanceModule.key))
live = toggleModule(live, attendanceModule.key, true)
check('toggling it back on returns it', live.has(attendanceModule.key))

/* ------- and the page switches survive the module being switched off ---- */

const kept = seedSheet(PAGES, stored)
check('page switches are untouched by the gate', kept[student.key].edit === true)

/* ------------------- the administrator is outside both rules ------------ */

const admin = adminAccess()

check('admin sees every page', admin.pages.size === PAGES.length)
check(
  'admin can view all of them',
  [...admin.pages.values()].every((p) => p.view)
)
check(
  'admin can edit everything editable',
  PAGES.filter((p) => p.actions?.includes?.('edit') ?? true).every(
    (p) => admin.pages.get(p.key).edit || !ALL_CODES.has(`${p.section}.write`)
  )
)
check('admin holds every permission code', admin.permissions.size === ALL_CODES.size)
check('admin can read students', admin.permissions.has('students.read'))
check('admin can delete students', admin.permissions.has('students.delete'))
check('admin can manage users', admin.permissions.has('users.write'))
check('admin can read the audit trail', admin.permissions.has('core.audit.read'))

// The point of the flag: it does not depend on any row, so no empty, stale or
// not-yet-created table can take it away.
check(
  'admin access needs no stored rows',
  adminAccess().pages.size > 0 && accessFrom([], []).pages.size === 0
)

/* ------------------- every link on the dashboard is a page somebody holds - */

// The dashboard hides a link when the viewer's sheet does not open its
// target: pages.get(href).view, the same rule the sidebar is built from.
//
// Which means a MISTYPED href fails silently and identically -- the link
// simply never appears, for anybody, administrator included, and no error is
// raised anywhere. Renaming a route in nav-items.js does the same thing to
// every dashboard link still pointing at the old one.
//
// So the hrefs are checked against the catalogue here rather than trusted.
// Query strings are stripped: a tab is not part of a page's identity.
const dashboard = await readFile(path.join(root, 'app', 'school', 'page.js'), 'utf8')
const linked = [...new Set([...dashboard.matchAll(/'(\/school[^']*)'/g)].map((m) => m[1]))]
const keys = new Set(PAGES.map((p) => p.key))

check('the dashboard links somewhere at all', linked.length > 0)
for (const href of linked) {
  check(`dashboard link is a real page: ${href}`, keys.has(href.split('?')[0]))
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
