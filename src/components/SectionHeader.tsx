interface SectionHeaderProps {
  number: string;
  title: string;
  hint?: string;
}

export default function SectionHeader({ number, title, hint }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-2 border-b border-bdr pb-4 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-3">
        <span className="shrink-0 rounded-r6 border border-copper/25 bg-copper-bg px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-copper">
          {number}
        </span>
        <h2 className="min-w-0 font-sans text-[clamp(1.05rem,1rem+0.35vw,1.25rem)] font-semibold leading-snug tracking-tight text-t900">
          {title}
        </h2>
      </div>
      {hint ? (
        <p className="min-w-0 max-w-full text-[11px] leading-relaxed text-t500 sm:text-[12px] sm:max-w-[min(100%,520px)] sm:text-right">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
