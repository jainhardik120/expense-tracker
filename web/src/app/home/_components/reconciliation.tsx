const STAGGER_MS = 140;

const ROWS = [
  { label: 'Bank statement', amount: '1,24,860.00' },
  { label: 'This tracker', amount: '1,24,860.00' },
];

export const Reconciliation = () => (
  <figure className="border-border/60 bg-card m-0 self-center rounded-xl border p-6 sm:p-8">
    <dl className="grid gap-4">
      {ROWS.map((row, index) => (
        <div
          key={row.label}
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 fill-mode-backwards flex items-baseline justify-between gap-6 duration-500"
          style={{ animationDelay: `${index * STAGGER_MS}ms` }}
        >
          <dt className="text-muted-foreground text-sm">{row.label}</dt>
          <dd className="font-mono text-lg tabular-nums">₹{row.amount}</dd>
        </div>
      ))}
    </dl>

    <div className="border-border/60 mt-6 border-t pt-6">
      <div
        className="motion-safe:animate-in motion-safe:fade-in fill-mode-backwards flex items-baseline justify-between gap-6 duration-700"
        style={{ animationDelay: '380ms' }}
      >
        <span className="font-medium">Difference</span>
        <span className="text-primary font-mono text-3xl font-semibold tabular-nums">₹0.00</span>
      </div>
    </div>

    <figcaption className="text-muted-foreground mt-5 text-sm leading-6">
      A worked example: three years of statements, matched one transaction at a time.
    </figcaption>
  </figure>
);
