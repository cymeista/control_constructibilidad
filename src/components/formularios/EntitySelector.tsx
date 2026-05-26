import {
  Building2,
  Users,
  FolderOpen,
  FileText,
  Clock,
  TrendingUp,
  ClipboardList,
  LineChart,
} from "lucide-react";
import type { EntityType } from "./EntitySelector.types";

export type { EntityType } from "./EntitySelector.types";

interface EntityConfig {
  key: EntityType;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
}

const entities: EntityConfig[] = [
  { key: "clientes", label: "Clientes", icon: Building2, color: "#4F46E5", description: "Empresas mineras y clientes" },
  { key: "profesionales", label: "Profesionales", icon: Users, color: "#047857", description: "Equipo técnico y PMs" },
  { key: "pm_internos", label: "PM Internos", icon: Users, color: "#0F766E", description: "Base independiente de PM" },
  { key: "proyectos", label: "Proyectos", icon: FolderOpen, color: "#3730A3", description: "Proyectos activos y completados" },
  { key: "entregables", label: "Entregables", icon: FileText, color: "#6366F1", description: "Documentos y entregables" },
  { key: "asignaciones_horas", label: "Asignaciones", icon: ClipboardList, color: "#0D9488", description: "Horas comprometidas por entregable" },
  { key: "registro_horas", label: "Registro de Horas", icon: Clock, color: "#B45309", description: "Carga semanal de horas" },
  { key: "pipeline", label: "Pipeline", icon: TrendingUp, color: "#8B5CF6", description: "Propuestas comerciales" },
  {
    key: "curvas_objetivo_anual",
    label: "Curva objetivo anual",
    icon: LineChart,
    color: "#0D9488",
    description: "Meta horaria del equipo por año (100%)",
  },
];

interface EntitySelectorProps {
  active: EntityType;
  counts: Record<EntityType, number>;
  onSelect: (e: EntityType) => void;
}

export default function EntitySelector({ active, counts, onSelect }: EntitySelectorProps) {
  const activeEntity = entities.find((e) => e.key === active);

  return (
    <>
      {/* Móvil: selector compacto */}
      <div className="mb-5 min-w-0 md:hidden">
        <label htmlFor="entity-select-mobile" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-t400">
          Entidad
        </label>
        <select
          id="entity-select-mobile"
          value={active}
          onChange={(e) => onSelect(e.target.value as EntityType)}
          className="w-full rounded-r8 border border-bdr bg-white px-3 py-3 text-[14px] font-medium text-t900 shadow-sh1 outline-none transition-all focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)]"
        >
          {entities.map((entity) => (
            <option key={entity.key} value={entity.key}>
              {entity.label} ({counts[entity.key] ?? 0})
            </option>
          ))}
        </select>
        {activeEntity ? (
          <p className="mt-1.5 text-[11px] leading-snug text-t500">{activeEntity.description}</p>
        ) : null}
      </div>

      {/* Escritorio / tablet: grid de tarjetas */}
      <div className="mb-[26px] hidden min-w-0 grid-cols-2 gap-[14px] md:grid lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9">
        {entities.map((entity) => {
          const isActive = active === entity.key;
          const Icon = entity.icon;
          const count = counts[entity.key] ?? 0;
          return (
            <button
              key={entity.key}
              type="button"
              onClick={() => onSelect(entity.key)}
              className={`relative flex flex-col items-start rounded-r12 border bg-white p-[18px_20px_15px] shadow-sh1 transition-all duration-200 hover:shadow-sh2 hover:-translate-y-px ${isActive ? "border-2" : "border border-bdr"}`}
              style={{
                borderTop: `3px solid ${entity.color}`,
                borderColor: isActive ? entity.color : undefined,
              }}
            >
              <Icon size={24} color={entity.color} className="mb-3" />
              <span className="text-[13px] font-semibold text-t900">{entity.label}</span>
              <span className="mt-1 text-[11px] text-t500">{entity.description}</span>
              <span
                className="mt-2 inline-block rounded-[10px] px-2 py-[2px] text-[9.5px] font-bold"
                style={{ background: `${entity.color}18`, color: entity.color }}
              >
                {count} registros
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
