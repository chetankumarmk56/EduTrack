import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  BookOpen,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  GraduationCap,
  CalendarCheck,
  CreditCard,
  MessagesSquare,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import LegalLinks from '@/features/legal/components/LegalLinks';

const LOGO_SRC = '/brand-logo.png';

/**
 * Brand mark backed by the prismatic crystal logo. If the image asset is
 * missing it degrades gracefully to a styled cap icon so the page never
 * renders a broken-image placeholder.
 */
function BrandLogo({
  className,
  fallbackClassName,
  iconClassName,
}: {
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
}) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-amber-400 ${fallbackClassName ?? ''}`}
      >
        <GraduationCap className={iconClassName ?? 'h-7 w-7 text-white'} />
      </div>
    );
  }
  return (
    <img
      src={LOGO_SRC}
      alt="Arken Edu"
      onError={() => setOk(false)}
      className={className}
      draggable={false}
    />
  );
}

type Portal = {
  title: string;
  desc: string;
  icon: typeof Users;
  path: string;
  role: string;
  iconBg: string;
  iconText: string;
  hover: string;
  link: string;
};

// Full Tailwind class strings (not built dynamically) so the JIT keeps them.
const PORTALS: Portal[] = [
  {
    title: 'Parents & Students',
    desc: 'Track academics, attendance, timetables and pay fees — everything about your child in one view.',
    icon: Users,
    path: '/parent-login',
    role: 'parent',
    iconBg: 'bg-indigo-50',
    iconText: 'text-indigo-600',
    hover: 'hover:border-indigo-300 hover:shadow-indigo-100/60',
    link: 'text-indigo-600',
  },
  {
    title: 'Teachers',
    desc: 'Mark attendance, record results, and build lessons and question banks with AI assistance.',
    icon: BookOpen,
    path: '/teacher-login',
    role: 'teacher',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    hover: 'hover:border-emerald-300 hover:shadow-emerald-100/60',
    link: 'text-emerald-600',
  },
  {
    title: 'Administration',
    desc: 'Oversee directories, classes, finance and staff — a complete operational command centre.',
    icon: ShieldCheck,
    path: '/admin-login',
    role: 'admin',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
    hover: 'hover:border-amber-300 hover:shadow-amber-100/60',
    link: 'text-amber-600',
  },
];

const FEATURES = [
  {
    icon: CalendarCheck,
    title: 'Attendance & timetables',
    desc: 'Daily registers and class schedules, always in sync.',
  },
  {
    icon: BookOpen,
    title: 'Academics & lessons',
    desc: 'Marks, report cards and AI-assisted lesson planning.',
  },
  {
    icon: CreditCard,
    title: 'Fees & payments',
    desc: 'Transparent dues, receipts and secure online payment.',
  },
  {
    icon: MessagesSquare,
    title: 'Announcements',
    desc: 'Keep families and staff informed in real time.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handlePortalClick = async (item: { path: string; role: string }) => {
    // If a session for a different role is active, clear it first so GuestRoute
    // doesn't bounce the user straight back into their old portal. Await the
    // server-side cookie clear before navigating.
    if (user && user.role !== item.role && !(user.role === 'super_admin' && item.role === 'admin')) {
      await logout();
    }
    navigate(item.path);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbfbfd] text-slate-900">
      {/* Soft static colour washes — no animation, no heavy graphics. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[460px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-violet-200/45 via-indigo-200/35 to-transparent blur-3xl" />
        <div className="absolute -right-32 top-40 h-[360px] w-[360px] rounded-full bg-amber-100/40 blur-3xl" />
        <div className="absolute bottom-0 -left-24 h-[340px] w-[340px] rounded-full bg-sky-100/40 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <BrandLogo
            className="h-9 w-9 object-contain"
            fallbackClassName="h-9 w-9"
            iconClassName="h-5 w-5 text-white"
          />
          <span className="text-lg font-semibold tracking-tight">
            Arken<span className="text-indigo-600"> Edu</span>
          </span>
        </div>
        <a
          href="#portals"
          className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 sm:inline-flex"
        >
          Sign in
          <ArrowRight className="h-4 w-4" />
        </a>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-4xl px-5 pb-16 pt-8 text-center sm:px-8 sm:pb-20 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          Unified school management platform
        </span>

        <div className="relative mx-auto mt-9 w-fit">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 scale-125 rounded-full bg-gradient-to-br from-violet-300/40 via-indigo-300/30 to-amber-200/30 blur-2xl"
          />
          <BrandLogo
            className="mx-auto h-28 w-28 object-contain sm:h-36 sm:w-36"
            fallbackClassName="h-28 w-28 sm:h-36 sm:w-36"
            iconClassName="h-14 w-14 text-white sm:h-20 sm:w-20"
          />
        </div>

        <h1 className="mt-9 text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Run your whole school
          <br className="hidden sm:block" /> from a single place
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-500 sm:text-lg">
          Arken Edu brings faculty, families and administration together — attendance,
          academics, fees and communication in one secure, beautifully simple workspace.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#portals"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-7 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-slate-800 sm:w-auto"
          >
            Choose your portal
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#features"
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-7 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 sm:w-auto"
          >
            Explore features
          </a>
        </div>
      </section>

      {/* Portals */}
      <section id="portals" className="relative z-10 mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Sign in to your portal
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Choose the experience built for your role.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {PORTALS.map((item) => (
            <button
              key={item.role}
              onClick={() => handlePortalClick(item)}
              className={`group flex h-full flex-col items-start rounded-2xl border border-slate-200 bg-white p-7 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${item.hover}`}
            >
              <span className={`mb-5 inline-flex rounded-xl p-3 ${item.iconBg} ${item.iconText}`}>
                <item.icon className="h-6 w-6" />
              </span>
              <h3 className="text-xl font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{item.desc}</p>
              <span className={`mt-6 inline-flex items-center gap-1.5 text-sm font-semibold ${item.link}`}>
                Sign in
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 border-t border-slate-200/70 bg-white/60">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Everything your school needs
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              One connected system — no spreadsheets, no scattered tools.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="inline-flex rounded-xl bg-slate-100 p-2.5 text-slate-700">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-7 text-sm text-slate-500 sm:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <BrandLogo
                className="h-6 w-6 object-contain"
                fallbackClassName="h-6 w-6 rounded-lg"
                iconClassName="h-3.5 w-3.5 text-white"
              />
              <span className="font-medium text-slate-700">Arken Edu</span>
            </div>
            <LegalLinks className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-slate-500" />
          </div>
          <div className="border-t border-slate-200/70 pt-4 text-center sm:text-left">
            <span>© {new Date().getFullYear()} Arken Edu. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
