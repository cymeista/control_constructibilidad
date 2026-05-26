import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Fase 1+: `auto` elegirá tabla o cards según breakpoint. Por ahora solo `table`. */
export type DataTableLayout = "table" | "auto";

export type DataTableMobileBreakpoint = "md" | "lg";

interface DataTableProps {
  headers: string[];
  children: ReactNode;
  footerLeft?: string;
  footerRight?: string;
  className?: string;
  /**
   * Preparación Fase 1: en `auto`, si se define `renderMobileRow`, se podrá mostrar cards en móvil.
   * En Fase 0 siempre se renderiza la tabla con scroll horizontal contenido.
   */
  layout?: DataTableLayout;
  mobileBreakpoint?: DataTableMobileBreakpoint;
  renderMobileRow?: (rowIndex: number) => ReactNode;
}

export default function DataTable({
  headers,
  children,
  footerLeft,
  footerRight,
  className,
  layout = "table",
  mobileBreakpoint = "md",
}: DataTableProps) {
  return (
    <div
      className={cn("max-w-full min-w-0 overflow-hidden rounded-r12 border border-bdr bg-surface shadow-sh1", className)}
      data-table-layout={layout}
      data-table-mobile-breakpoint={mobileBreakpoint}
    >
      <div className="max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-bdr bg-surface2/90">
              {headers.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-t500"
                  scope="col"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-t800">{children}</tbody>
        </table>
      </div>
      {(footerLeft || footerRight) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bdr bg-surface2/80 px-4 py-2.5 text-[12px] text-t500">
          <span className="min-w-0">{footerLeft}</span>
          <span className="min-w-0 shrink-0">{footerRight}</span>
        </div>
      )}
    </div>
  );
}
