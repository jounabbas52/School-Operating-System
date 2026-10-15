import { redirect } from "next/navigation";
import { getSchoolContext } from "@/lib/school-context";
import { paletteCss, formatLongDate } from "@/lib/appearance";
import { signOut } from "../admin/actions";
import {
  TopSearch,
  Notifications,
  UserMenu,
  ThemeMenu,
} from "@/components/topbar";
import { ToastProvider } from "@/components/toast";
import Nav from "./nav";
import { NAV } from "./nav-items";

export const metadata = { title: "School Management" };

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default async function SchoolLayout({ children }) {
  const { user, schoolId, school, permissions, profile, modules, appearance, supabase } =
    await getSchoolContext();

  if (!user) redirect("/login");

  if (!schoolId) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1
            className="text-base font-semibold"
            style={{ color: "var(--ink)" }}
          >
            No school access
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            {user.email} is not attached to an active school. Either nobody has
            assigned you yet, your account is suspended, or the school itself
            has been switched off.
          </p>
          <form action={signOut} className="mt-6">
            <button className="btn btn-ghost">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  // Filtered on the server: a link for a module the school does not have never
  // reaches the browser at all.
  const enabled = new Set(modules.map((m) => m.code));
  const items = NAV
    // A top-level entry may name a permission too -- Audit Logs is a single
    // link, not a group, and only a role holding core.audit.read should see
    // it at all.
    .filter(
      (item) =>
        enabled.has(item.module) &&
        (!item.permission || permissions.has(item.permission)),
    )
    .map((item) =>
      item.children
        ? {
            ...item,
            children: item.children.filter(
              (child) =>
                (!child.module || enabled.has(child.module)) &&
                (!child.permission || permissions.has(child.permission)),
            ),
          }
        : item,
    )
    // A group whose children were all filtered away is an empty accordion.
    .filter((item) => !item.children || item.children.length > 0);

  const roleName =
    profile?.profile_roles?.[0]?.roles?.display_name ?? "No role";

  // RLS already limits this to the caller's own notifications plus school
  // broadcasts, so no extra filtering is needed here.
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  // In the school's own zone, not the server's. A box in UTC renders
  // yesterday's date for the first five hours of every Asia/Karachi day.
  const today = formatLongDate(new Date(), { timezone: appearance.timezone });

  return (
    <ToastProvider>
      {/* The school's accent colour. In <body> on purpose: it has to beat
          globals.css on document order, and it has to reach the toast stack,
          which portals to document.body outside this tree. */}
      <style dangerouslySetInnerHTML={{ __html: paletteCss(appearance.color_theme) }} />

      <div className="flex min-h-dvh">
        {/* ------------------------------------------------------------ sidebar */}
        <aside
          data-variant={appearance.sidebar_style === "light" ? "light" : "dark"}
          className="app-sidebar relative sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col overflow-y-auto lg:flex"
        >
          <div className="flex items-center gap-2.5 px-4 py-4">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: "var(--brand-grad)" }}
            >
              {school?.school_name?.[0] ?? "S"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[0.85rem] font-semibold leading-tight text-[var(--side-strong)]">
                {school?.school_name}
              </p>
              <p
                className="text-[0.62rem] font-medium uppercase tracking-widest"
                style={{ color: "var(--side-dim)" }}
              >
                School Panel
              </p>
            </div>
          </div>

          <div className="px-3 pb-3">
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-2"
              style={{
                background: "var(--side-alt)",
                border: "1px solid var(--side-border)",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: "var(--side-dim)" }}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
              </svg>
              <span
                className="flex-1 text-[0.78rem]"
                style={{ color: "var(--side-dim)" }}
              >
                Quick search…
              </span>
              <kbd
                className="rounded px-1.5 py-0.5 font-mono text-[0.6rem]"
                style={{ background: "var(--side)", color: "var(--side-dim)" }}
              >
                Ctrl K
              </kbd>
            </div>
          </div>

          <div className="flex-1">
            <Nav items={items} />
          </div>

          <div
            className="px-3 py-3"
            style={{ borderTop: "1px solid var(--side-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[0.68rem] font-semibold text-white"
                style={{ background: "var(--brand-grad)" }}
              >
                {initials(profile?.full_name, user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.78rem] font-medium text-[var(--side-strong)]">
                  {profile?.full_name || user.email}
                </p>
                <p
                  className="truncate text-[0.66rem]"
                  style={{ color: "var(--side-dim)" }}
                >
                  {roleName}
                </p>
              </div>
            </div>
            <form action={signOut} className="mt-2">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.76rem] transition hover:bg-white/5"
                style={{ color: "var(--side-dim)" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Logout
              </button>
            </form>
          </div>
        </aside>

        {/* --------------------------------------------------------------- main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="app-topbar sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                style={{ color: "var(--muted)" }}
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
              </svg>
              <span
                className="truncate text-[0.8rem] font-medium"
                style={{ color: "var(--ink-2)" }}
              >
                {today}
              </span>
              <span className="ml-1 hidden lg:inline-flex pill pill-brand">
                {school?.school_name}
              </span>
            </div>

            <TopSearch enabled={false} />

            <div className="flex items-center gap-1.5">
              <ThemeMenu />
              <Notifications items={notifications ?? []} />
              <UserMenu
                name={profile?.full_name}
                email={user.email}
                role={roleName}
                settingsHref="/school"
                signOutAction={signOut}
              />
            </div>
          </header>

          <main className="flex-1 px-5 py-5">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
