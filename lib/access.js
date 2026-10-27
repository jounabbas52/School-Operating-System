import { NAV } from '@/app/school/nav-items'

// ACCESS -- the whole of it, in two rules.
//
//   1. MODULE   a sidebar group is on or off for this person. Off, and the
//               whole group vanishes: Students, its seven pages, all of it.
//               Nothing under it exists for them, however the page switches
//               below happen to be set.
//
//   2. PAGE     inside a module that is on, each page carries VIEW, EDIT,
//               DELETE -- any, all or none of the three.
//
// A page they were not given does not appear in their sidebar and does not
// open. A page they can view but not edit opens exactly as it does for the
// administrator -- same screen, same records -- with the Add and Save buttons
// gone. Edit without Delete means they can change a record and not remove it.
//
// The two are ANDed, and both are stored. Switching a module off hides
// everything under it without forgetting the page switches underneath, so
// switching it back on returns the person to exactly where they were.
//
// There are no roles, no scopes, no teacher panel, nothing inherited. Two
// people doing the same job can have completely different lists, and changing
// one changes nothing for the other.
//
// HOW IT REACHES THE DATABASE
//
// Every RLS policy in the schema asks has_permission('students.write') and
// friends. Those calls are unchanged; what answers them is this list. A code
// names a SECTION and a verb, and the answer is yes when any page the person
// holds in that section allows that verb:
//
//     students.read    some students page with view
//     students.write   some students page with edit
//     students.delete  some students page with delete
//
// permission_map in the database does the same join, so the menu and the
// row-level rules cannot disagree about what somebody may do.

export const ACTIONS = ['view', 'edit', 'delete']

export const ACTION_LABEL = { view: 'View', edit: 'Edit', delete: 'Delete' }

export const ACTION_COLUMN = { view: 'can_view', edit: 'can_edit', delete: 'can_delete' }

/* ------------------------------------------------------------- the sections */

// A section is one module of the app: the unit the database enforces, because
// its policies are written per table. The codes are what those policies ask
// for, unchanged since the first migration.
export const SECTIONS = {
  dashboard: { label: 'Dashboard', module: 'core', actions: ['view'] },
  academics: { label: 'System Setup', module: 'academics', view: 'academics.read', write: 'academics.write' },
  students: { label: 'Students', module: 'students', view: 'students.read', write: 'students.write' },
  staff: { label: 'Staff', module: 'staff', view: 'staff.read', write: 'staff.write' },
  hr: { label: 'Leave', module: 'hr', view: 'hr.read', write: 'hr.write' },
  attendance: { label: 'Attendance', module: 'attendance', view: 'attendance.read', write: 'attendance.write' },
  tests: { label: 'Tests', module: 'tests', view: 'tests.read', write: 'tests.write' },
  exams: {
    label: 'Exams',
    module: 'exams',
    view: 'exams.read',
    write: 'exams.write',
    // Publishing results rides with editing them: a school that lets somebody
    // enter marks lets them publish, and a fourth switch on one section out
    // of eighteen is not worth the width.
    extraWrite: ['exams.publish'],
  },
  fees: { label: 'Fees', module: 'fees', view: 'fees.read', write: 'fees.write' },
  accounts: { label: 'Accounts', module: 'accounts', view: 'accounts.read', write: 'accounts.write' },
  payroll: { label: 'Payroll', module: 'payroll', view: 'payroll.read', write: 'payroll.write' },
  library: { label: 'Library', module: 'library', view: 'library.read', write: 'library.write' },
  transport: { label: 'Transport', module: 'transport', view: 'transport.read', write: 'transport.write' },
  frontdesk: { label: 'Front Desk', module: 'frontdesk', view: 'frontdesk.read', write: 'frontdesk.write' },
  // Without an entry here a section is invisible to the access system: both
  // accessFrom() and adminAccess() build their permission sets from this
  // map, so the codes would never be held by anybody -- not even an
  // administrator -- and every button on the screen would render read-only
  // while RLS happily allowed the write.
  whatsapp: { label: 'WhatsApp', module: 'whatsapp', view: 'whatsapp.read', write: 'whatsapp.write' },
  admissions: { label: 'Admissions', module: 'admissions', view: 'admissions.read', write: 'admissions.write' },
  reports: { label: 'Reports', module: 'reports', view: 'reports.read', write: 'reports.write' },
  users: { label: 'Users & Access', module: 'users', view: 'users.read', write: 'users.write', danger: true },
  // The settings screen is its own editor: there is nothing to delete.
  settings: {
    label: 'School Settings',
    module: 'core',
    write: 'core.settings.write',
    danger: true,
    actions: ['view', 'edit'],
  },
  // A trail nobody may change, by design.
  audit: { label: 'Audit Trail', module: 'core', view: 'core.audit.read', danger: true, actions: ['view'] },
}

// Three core screens belong to the core module but are handed out separately.
const SECTION_FOR_HREF = {
  '/school': 'dashboard',
  '/school/settings': 'settings',
  '/school/audit': 'audit',
}

export const deleteCodeFor = (section) =>
  section?.view && section?.write ? `${section.module}.delete` : null

/* ---------------------------------------------------------------- the pages */

// The menu, flattened. Generated from NAV so the access screen and the
// sidebar cannot drift: a page in one is a page in the other, by
// construction. `key` is the route, which is the only name a page reliably
// has.
const slug = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function buildTree() {
  return NAV.map((item) => {
    const children = item.children ?? [item]
    const key = slug(item.label)
    return {
      key,
      label: item.label,
      pages: children
        .filter((child) => child.href)
        .map((child) => ({
          key: child.href,
          label: child.label,
          href: child.href,
          // Which sidebar GROUP this page sits under -- the first rule's unit.
          module: key,
          // Which part of the DATABASE it reads -- the second rule's unit.
          section: SECTION_FOR_HREF[child.href] ?? child.module ?? item.module,
          built: child.built !== false,
        })),
    }
  }).filter((group) => group.pages.length > 0)
}

export const PAGE_TREE = buildTree()
export const PAGES = PAGE_TREE.flatMap((g) => g.pages)
export const PAGE_BY_KEY = Object.fromEntries(PAGES.map((p) => [p.key, p]))

// What may be switched on for one page. Most offer all three; the dashboard
// and the audit trail are view-only, and settings has nothing to delete.
export function actionsFor(page) {
  const section = SECTIONS[page?.section]
  if (!section) return ['view']
  return section.actions ?? ACTIONS
}

// Plain data for the browser: no functions, nothing undefined. Narrowed to
// the modules this school has, because a switch that grants nothing however
// it is set is worse than no switch.
export function accessTree(enabledModules) {
  const enabled = new Set(enabledModules)

  return PAGE_TREE.map((group) => ({
    key: group.key,
    label: group.label,
    pages: group.pages
      .filter((page) => enabled.has(SECTIONS[page.section]?.module ?? page.section))
      .map((page) => ({
        key: page.key,
        label: page.label,
        href: page.href,
        section: page.section,
        built: page.built,
        actions: actionsFor(page),
      })),
  })).filter((group) => group.pages.length > 0)
}

/* ------------------------------------------- their rows -> what they may do */

// Two answers out of one list:
//
//   pages        per page, which of the three they hold. Drives the sidebar
//                and the buttons on the screen itself.
//   permissions  the flat codes every existing check and every RLS policy
//                speaks in, rolled up per section exactly as the database
//                rolls them up.
export function accessFrom(rows, moduleRows) {
  const pages = new Map()
  const permissions = new Set()
  const roll = new Map()

  // Rule 1. A module that is off removes everything under it, so its pages
  // are dropped here rather than being filtered again by every caller.
  const liveModules = new Set(
    (moduleRows ?? []).filter((m) => m.enabled).map((m) => m.module)
  )

  for (const row of rows ?? []) {
    if (!liveModules.has(PAGE_BY_KEY[row.page]?.module)) continue

    pages.set(row.page, {
      view: Boolean(row.can_view),
      edit: Boolean(row.can_edit),
      delete: Boolean(row.can_delete),
    })

    const held = roll.get(row.section) ?? { view: false, edit: false, delete: false }
    held.view = held.view || Boolean(row.can_view)
    held.edit = held.edit || Boolean(row.can_edit)
    held.delete = held.delete || Boolean(row.can_delete)
    roll.set(row.section, held)
  }

  for (const [key, held] of roll) {
    const section = SECTIONS[key]
    if (!section) continue

    if (held.view && section.view) permissions.add(section.view)
    if (held.edit && section.write) {
      permissions.add(section.write)
      for (const extra of section.extraWrite ?? []) permissions.add(extra)
    }
    if (held.delete) {
      const code = deleteCodeFor(section)
      if (code) permissions.add(code)
    }
  }

  return { pages, permissions }
}

export function moduleOf(code) {
  return code.split('.')[0]
}

/* ----------------------------------------------- the access sheet, as data */

// Pure, and out here rather than inside the dialog, so both can be tested
// without a browser -- these decide everything a switch does.

// What is stored -> what the switches show. A page with no row is a page with
// nothing switched on: the same thing said two ways.
export function seedSheet(pages, rows) {
  const sheet = {}
  for (const page of pages) {
    const row = (rows ?? []).find((r) => r.page === page.key)
    sheet[page.key] = {
      view: Boolean(row?.can_view),
      edit: Boolean(row?.can_edit),
      delete: Boolean(row?.can_delete),
    }
  }
  return sheet
}

// ONE SWITCH, ONE PAGE. Nothing here reaches any other page: Student
// Attendance can be given without Staff Attendance or the reports beside it.
//
// The only two couplings are inside a single row, and both are obvious:
// turning View off clears that page's Edit and Delete, because nothing can be
// changed on a screen nobody can open; and turning Edit or Delete on turns
// View on, because nobody edits a screen they cannot reach.
export function applyToggle(sheet, pageKey, action, value) {
  const row = { ...sheet[pageKey], [action]: value }

  if (action === 'view' && !value) {
    row.edit = false
    row.delete = false
  }
  if (action !== 'view' && value) row.view = true

  return { ...sheet, [pageKey]: row }
}

// Everything on, or everything off, for a list of pages.
export function setPages(sheet, pages, value) {
  const next = { ...sheet }
  for (const page of pages) {
    const allowed = actionsFor(page)
    next[page.key] = {
      view: value,
      edit: value && allowed.includes('edit'),
      delete: value && allowed.includes('delete'),
    }
  }
  return next
}

export function countGranted(sheet, pages) {
  return pages.reduce(
    (n, page) => n + actionsFor(page).filter((a) => sheet[page.key]?.[a]).length,
    0
  )
}

export function countTotal(pages) {
  return pages.reduce((n, page) => n + actionsFor(page).length, 0)
}

/* ------------------------------------------------- rule 1: the module gate */

// Stored module rows -> the set of groups that are on. No row is off: the
// same deny-by-default the page list uses, so a group added to the app later
// is closed until somebody opens it.
export function modulesFrom(moduleRows) {
  return new Set((moduleRows ?? []).filter((m) => m.enabled).map((m) => m.module))
}

// Turning a module off does not touch the page switches underneath. That is
// the point of storing both: switch the group back on and the person is
// exactly where they were, rather than starting from nothing.
export function toggleModule(modules, key, value) {
  const next = new Set(modules)
  if (value) next.add(key)
  else next.delete(key)
  return next
}

// What a module row looks like once a module is on but no page under it has
// been switched on yet: the group appears, with nothing in it. Worth saying
// in the UI rather than leaving an admin to wonder.
export function moduleIsEmpty(sheet, group) {
  return group.pages.every((page) => !sheet[page.key]?.view)
}

/* ------------------------------------------------------- the administrator */

// THE ADMINISTRATOR IS NOT A USER WITH A VERY LONG LIST.
//
// They are the person who hands out the lists, and they are outside the two
// rules entirely: every module, every page, every switch, always. There is
// nothing to configure for them and no way to configure them into a corner.
//
// That is a deliberate asymmetry, and it is what makes the rest safe to play
// with. An access system whose own administrator can be locked out of the
// screen that fixes it has one failure mode that costs you the whole school,
// and we found it twice the hard way.
//
// profiles.is_school_admin is the flag, and has_permission() short-circuits
// on it in the database, so this holds for rows as well as for menus.

// Every code the catalogue can produce -- what an administrator holds.
export const ALL_CODES = new Set(
  Object.values(SECTIONS).flatMap((s) =>
    [s.view, s.write, deleteCodeFor(s), ...(s.extraWrite ?? [])].filter(Boolean)
  )
)

// An administrator's page list: all of it, everything switched on. Built from
// the same PAGES the sidebar is drawn from, so "the admin sees everything"
// cannot drift away from what everything actually is.
export function adminAccess() {
  const pages = new Map()
  for (const page of PAGES) {
    const allowed = actionsFor(page)
    pages.set(page.key, {
      view: true,
      edit: allowed.includes('edit'),
      delete: allowed.includes('delete'),
    })
  }
  return { pages, permissions: new Set(ALL_CODES) }
}
