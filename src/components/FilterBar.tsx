interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  filters: {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (value: string) => void;
  }[];
}

export default function FilterBar({ filters }: FilterBarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
      {filters.map((f) => (
        <div
          key={f.key}
          className="flex w-full min-w-0 flex-col gap-1.5 sm:min-w-[min(100%,200px)] sm:flex-1"
        >
          <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-t400">{f.label}</label>
          <select
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className="w-full rounded-r8 border border-bdr bg-surface px-3 py-2.5 text-[13px] text-t700 outline-none transition-all focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)]"
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
