import { getSchoolContext } from '@/lib/school-context'
import { SETTINGS_COLUMNS } from '@/lib/whatsapp-options'
import WhatsAppSettings from './whatsapp-settings'

export const metadata = { title: 'WhatsApp Settings' }

// Everything WhatsApp, on one screen inside Settings.
//
// It used to be three pages under a Communication section -- the screen, the
// templates and the log. They are tabs now, because they were never three
// destinations: a school links the phone, writes the notices, switches on
// the events that send them, and then looks at what went out. That is one
// job, and splitting it across the sidebar made the auto-send switch and the
// words it sends live on different pages.
//
// The message list is capped rather than paginated for the same reason: this
// is a settings screen, and somebody auditing six months of messages is
// doing something the log cap should push them to ask for properly.
const RECENT_LIMIT = 200

export default async function WhatsAppSettingsPage() {
  const { schoolId, permissions, supabase } = await getSchoolContext()
  const canWrite = permissions.has('whatsapp.write')

  const [
    { data: settings },
    { data: templates },
    { data: messages },
    { data: classes },
    { data: sections },
    { count: optedOut },
  ] = await Promise.all([
    // NAMED COLUMNS, NOT '*'. api_access_token has its SELECT revoked from
    // authenticated, so a star query fails the whole page with a permission
    // error rather than quietly omitting it. See 028, section 7e.
    supabase
      .from('whatsapp_settings')
      .select(SETTINGS_COLUMNS)
      .eq('school_id', schoolId)
      .maybeSingle(),
    supabase
      .from('whatsapp_templates')
      .select('id, name, body, variables, event, is_active, meta_name, meta_lang, meta_status')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('event'),
    supabase
      .from('whatsapp_messages')
      .select(
        'id, direction, to_phone, template_name, body, status, error_detail, ' +
          'attempts, created_at, sent_at, delivered_at, read_at, source, ' +
          'students(first_name, last_name, admission_number)'
      )
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('sections')
      .select('id, name, class_id')
      .eq('school_id', schoolId)
      .eq('is_deleted', false)
      .order('name'),
    supabase
      .from('whatsapp_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('opted_out', true),
  ])

  return (
    <WhatsAppSettings
      settings={settings}
      templates={templates ?? []}
      messages={messages ?? []}
      classes={classes ?? []}
      sections={sections ?? []}
      optedOut={optedOut ?? 0}
      canWrite={canWrite}
    />
  )
}
