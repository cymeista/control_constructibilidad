import type { ReactNode } from "react";

export function MobileCardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(5.5rem,34%)]_1fr gap-x-2 gap-y-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-t400">{label}</span>
      <div className="min-w-0 text-[13px] leading-snug text-t900">{children}</div>
    </div>
  );
}
