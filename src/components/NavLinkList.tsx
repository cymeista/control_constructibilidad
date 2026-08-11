import { NavLink } from "react-router";
import type { NavGroupConfig, NavItemConfig } from "@/navigation/appNavConfig";

interface NavLinkListProps {
  items: NavItemConfig[];
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}

export default function NavLinkList({ items, variant, onNavigate }: NavLinkListProps) {
  const isSidebar = variant === "sidebar";

  return (
    <>
      {items.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            title={tab.label}
            onClick={onNavigate}
            className={({ isActive }) =>
              isSidebar
                ? `flex items-center gap-3 rounded-r8 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-white/[0.1] text-white shadow-[inset_3px_0_0_0_#c45d2c]"
                      : "text-white/60 hover:bg-white/[0.06] hover:text-white/90"
                  }`
                : `flex items-center gap-3 rounded-r10 px-3 py-3 text-[14px] font-medium transition-colors ${
                    isActive
                      ? "bg-copper-bg text-copper shadow-[inset_3px_0_0_0_#c45d2c]"
                      : "text-t700 hover:bg-surface2"
                  }`
            }
          >
            <Icon size={18} strokeWidth={1.75} className="shrink-0 opacity-90" />
            <span className="leading-snug">{tab.label}</span>
          </NavLink>
        );
      })}
    </>
  );
}

interface NavGroupedListProps {
  groups: NavGroupConfig[];
  variant: "sidebar" | "drawer";
  onNavigate?: () => void;
}

/** Lista agrupada: encabezados no seleccionables; omite grupos ya vacíos. */
export function NavGroupedList({ groups, variant, onNavigate }: NavGroupedListProps) {
  const isSidebar = variant === "sidebar";

  return (
    <div className="flex flex-col">
      {groups.map((group, idx) => (
        <div key={group.id} className={idx === 0 ? "" : isSidebar ? "mt-3" : "mt-4"}>
          <p
            className={
              isSidebar
                ? "mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35"
                : "mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-t400"
            }
          >
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            <NavLinkList items={group.items} variant={variant} onNavigate={onNavigate} />
          </div>
        </div>
      ))}
    </div>
  );
}
