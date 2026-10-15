import Link from 'next/link'
import { getSchoolContext } from '@/lib/school-context'
import ExportButtons from '@/components/export-buttons'
import RefreshButton from '@/components/refresh-button'
import ConfirmButton from '@/components/confirm'
import { staffName } from '@/lib/staff-options'
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABEL } from '@/lib/operations-options'
import { deleteContact } from '../actions'
import ContactPanel from './contact-panel'

export const metadata = { title: 'Phone Book' }

export default async function PhoneBookPage({ searchParams }) {
  const params = await searchParams
  const q = (params?.q ?? '').trim()
  const categoryFilter = params?.category ?? ''

  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('frontdesk.write')
  const canSeeStaff = permissions.has('staff.read')

  const [{ data: contactRows, error }, { data: staff }] = await Promise.all([
    supabase
      .from('contacts_directory')
      .select('id, name, designation, department, phone, extension, email, category, notes')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    // Staff are pulled LIVE rather than copied in. A phone book that has to be
    // kept in step by hand is a phone book that is wrong by October.
    canSeeStaff
      ? supabase
          .from('staff')
          .select('id, first_name, last_name, designation, department, phone, work_phone, work_email')
          .eq('school_id', schoolId)
          .eq('is_deleted', false)
          .eq('status', 'active')
          .order('first_name')
      : Promise.resolve({ data: [] }),
  ])

  const manual = (contactRows ?? []).map((c) => ({ ...c, source: 'manual' }))

  const fromStaff = (staff ?? [])
    .filter((s) => s.phone || s.work_phone)
    .map((s) => ({
      id: `staff-${s.id}`,
      name: staffName(s),
      designation: s.designation,
      department: s.department,
      phone: s.phone ?? s.work_phone,
      extension: null,
      email: s.work_email,
      // Teaching and admin staff land under Staff; the Management bucket is
      // for people someone adds there by hand.
      category: 'staff',
      source: 'staff',
    }))

  const all = [...fromStaff, ...manual]

  const needle = q.toLowerCase()
  const contacts = all
    .filter((c) => {
      if (categoryFilter && c.category !== categoryFilter) return false
      if (!needle) return true
      return [c.name, c.phone, c.email, c.designation, c.department]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  const exportRows = contacts.map((c, i) => ({
    n: i + 1,
    name: c.name ?? '',
    designation: c.designation ?? '',
    department: c.department ?? '',
    phone: c.phone ?? '',
    ext: c.extension ?? '',
    email: c.email ?? '',
    category: CONTACT_CATEGORY_LABEL[c.category] ?? c.category ?? '',
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Phone Book
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {contacts.length} contact{contacts.length === 1 ? '' : 's'} ·{' '}
            {fromStaff.length} pulled live from HR
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <ExportButtons
            rows={exportRows}
            columns={[
              { key: 'n', label: 'Sr' },
              { key: 'name', label: 'Name' },
              { key: 'designation', label: 'Designation' },
              { key: 'department', label: 'Department' },
              { key: 'phone', label: 'Phone' },
              { key: 'ext', label: 'Ext' },
              { key: 'email', label: 'Email' },
              { key: 'category', label: 'Category' },
            ]}
            filename="phone-book"
            title="Phone Book"
          />
          {canWrite && (
            <ContactPanel trigger={{ label: '+ Add Contact', className: 'btn btn-primary' }} />
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- filters */}
      <form className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/school/frontdesk/phonebook"
            className={`tab !px-2.5 !py-1 ${!categoryFilter ? 'tab-on' : ''}`}
          >
            All
          </Link>
          {CONTACT_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/school/frontdesk/phonebook?category=${c.id}`}
              className={`tab !px-2.5 !py-1 ${categoryFilter === c.id ? 'tab-on' : ''}`}
            >
              {c.label}
            </Link>
          ))}
        </div>

        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email…"
          className="field ml-auto min-w-52 max-w-xs"
        />
        {categoryFilter && <input type="hidden" name="category" value={categoryFilter} />}
        <button className="btn btn-primary">Search</button>
      </form>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--red-soft)', color: 'var(--red-ink)' }}
        >
          {error.message}
        </p>
      )}

      {!contacts.length ? (
        <div className="card px-6 py-16 text-center" style={{ borderStyle: 'dashed' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            No contacts found.
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
            {q || categoryFilter
              ? 'Try adjusting your filters.'
              : 'Staff appear here automatically once they have a phone number on file.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[60rem]">
            <thead>
              <tr>
                <th>Sr</th>
                <th>Name</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Ext</th>
                <th>Email</th>
                <th>Category</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.id}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span className="font-medium" style={{ color: 'var(--ink)' }}>
                      {c.name ?? '—'}
                    </span>
                    {c.source === 'staff' && (
                      <span className="ml-1.5 pill pill-blue">from HR</span>
                    )}
                  </td>
                  <td>{c.designation ?? '—'}</td>
                  <td>{c.department ?? '—'}</td>
                  <td className="tabular-nums">{c.phone ?? '—'}</td>
                  <td className="tabular-nums">{c.extension ?? '—'}</td>
                  <td>
                    <span className="block max-w-44 truncate">{c.email ?? '—'}</span>
                  </td>
                  <td>
                    <span className="pill pill-brand">
                      {CONTACT_CATEGORY_LABEL[c.category] ?? c.category ?? '—'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      {c.source === 'staff' ? (
                        <Link href="/school/hr" className="btn btn-ghost !px-2.5 !py-1">
                          Edit in HR
                        </Link>
                      ) : canWrite ? (
                        <>
                          <ContactPanel
                            row={c}
                            trigger={{ label: 'Edit', className: 'btn btn-ghost !px-2.5 !py-1' }}
                          />
                          <form action={deleteContact}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmButton
                              className="btn btn-danger !px-2.5 !py-1"
                              title={`Remove ${c.name}?`}
                              message="The contact leaves the phone book."
                              confirmLabel="Remove"
                            >
                              Delete
                            </ConfirmButton>
                          </form>
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                          read only
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
