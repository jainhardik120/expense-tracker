import type { ReactNode } from 'react';

type LegalSection = {
  title: string;
  body: ReactNode;
};

export const LegalShell = ({
  eyebrow,
  title,
  intro,
  sections,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  footer?: ReactNode;
}) => {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(242,97,69,0.16),_transparent_40%),linear-gradient(180deg,_#fff7f3_0%,_#ffffff_35%,_#fff5ef_100%)] text-slate-950">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12 sm:px-10 sm:py-16">
        <header className="rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-600">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <div className="mt-6 max-w-3xl text-base leading-7 text-slate-700">{intro}</div>
        </header>
        <div className="grid gap-6">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)] sm:p-8"
            >
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 sm:text-base">
                {section.body}
              </div>
            </section>
          ))}
        </div>
        {footer !== undefined ? (
          <footer className="rounded-[1.5rem] border border-slate-200/80 bg-slate-950 px-6 py-5 text-sm leading-7 text-slate-200 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.6)] sm:px-8">
            {footer}
          </footer>
        ) : null}
      </div>
    </main>
  );
};
