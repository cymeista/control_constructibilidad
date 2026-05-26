import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { useAppData } from "@/context/AppDataContext";
import { clearAppData, replaceAppData } from "@/persistence/dataRepository";
import { loadSettings as loadAppSettings, saveSettings as saveAppSettings } from "@/persistence/settingsRepository";
import SectionHeader from "@/components/SectionHeader";
import {
  Download,
  Upload,
  Database,
  Cloud,
  Settings,
  Info,
  Trash2,
  RotateCcw,
  FileJson,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Building2,
  Users,
  FolderOpen,
  FileText,
  Clock,
  TrendingUp,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/* ─────────── Settings Hook ─────────── */

interface AppSettings {
  showCompletedInGantt: boolean;
  criticalNotifications: boolean;
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD";
  thousandsSeparator: "punto" | "coma";
}

function loadSettings(): AppSettings {
  const fallback: AppSettings = {
    showCompletedInGantt: true,
    criticalNotifications: true,
    dateFormat: "DD/MM/YYYY",
    thousandsSeparator: "punto",
  };
  return loadAppSettings(fallback);
}

function saveSettings(s: AppSettings) {
  saveAppSettings(s);
}

function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}

/* ─────────── Helpers ─────────── */

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function objectToCSV<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

/* ─────────── SQL Schema ─────────── */

const SUPABASE_SCHEMA_SQL = `-- Crear tablas en Supabase
-- Ejecutar en SQL Editor del Dashboard

CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT '#4F46E5',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE profesionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre_completo TEXT NOT NULL,
  cargo TEXT CHECK (cargo IN ('L2','P2','P3','P4')),
  email TEXT,
  fecha_ingreso DATE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  cliente_id UUID REFERENCES clientes(id),
  project_manager_id UUID REFERENCES profesionales(id),
  estado TEXT CHECK (estado IN ('ACTIVO','COMPLETADO','NO_INICIADO','SUSPENDIDO')),
  fecha_inicio DATE,
  fecha_termino DATE,
  uf_presupuestadas DECIMAL(12,2) DEFAULT 0,
  hrs_presupuestadas DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE entregables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID REFERENCES proyectos(id),
  nombre TEXT NOT NULL,
  lider_id UUID REFERENCES profesionales(id),
  estado TEXT CHECK (estado IN ('NO_INICIADO','EN_PLAZO','ADELANTADO','RIESGO','CRITICO','COMPLETADO')),
  avance_real DECIMAL(5,4) DEFAULT 0,
  avance_teorico DECIMAL(5,4) DEFAULT 0,
  fecha_inicio DATE,
  fecha_termino DATE,
  fecha_revA DATE,
  fecha_revB DATE,
  fecha_revP DATE,
  uf_presupuestadas DECIMAL(12,2) DEFAULT 0,
  uf_consumidas DECIMAL(12,2) DEFAULT 0,
  hrs_presupuestadas DECIMAL(12,2) DEFAULT 0,
  hrs_gastadas DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE registro_horas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID REFERENCES profesionales(id),
  proyecto_id UUID REFERENCES proyectos(id),
  entregable_id UUID REFERENCES entregables(id),
  tipo_hora TEXT CHECK (tipo_hora IN ('DIRECTA','INDIRECTA','VACACIONES')),
  fecha DATE,
  horas DECIMAL(6,2) DEFAULT 0,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente TEXT NOT NULL,
  nombre_proyecto TEXT NOT NULL,
  etapa TEXT CHECK (etapa IN ('CONCEPTUAL','FACTIBILIDAD','DETALLE')),
  entregable TEXT,
  pm_responsable_id UUID REFERENCES profesionales(id),
  fecha_propuesta DATE,
  monto_uf DECIMAL(12,2) DEFAULT 0,
  estado TEXT CHECK (estado IN ('EN_ESPERA','EN_COTIZACION','APROBADO','RECHAZADO')),
  hrs_L2 DECIMAL(12,2) DEFAULT 0,
  hrs_P4 DECIMAL(12,2) DEFAULT 0,
  hrs_P3 DECIMAL(12,2) DEFAULT 0,
  hrs_P2 DECIMAL(12,2) DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE carga_mensual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_iso TEXT NOT NULL,
  profesional_id UUID REFERENCES profesionales(id),
  hrs_directas DECIMAL(12,2) DEFAULT 0,
  hrs_indirectas DECIMAL(12,2) DEFAULT 0,
  hrs_vacaciones DECIMAL(12,2) DEFAULT 0,
  hrs_objetivo DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices recomendados
CREATE INDEX idx_proyectos_cliente ON proyectos(cliente_id);
CREATE INDEX idx_entregables_proyecto ON entregables(proyecto_id);
CREATE INDEX idx_registro_horas_profesional ON registro_horas(profesional_id);
CREATE INDEX idx_registro_horas_fecha ON registro_horas(fecha);
CREATE INDEX idx_carga_mensual_mes ON carga_mensual(mes_iso);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ language 'plpgsql';

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profesionales_updated_at BEFORE UPDATE ON profesionales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_proyectos_updated_at BEFORE UPDATE ON proyectos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_entregables_updated_at BEFORE UPDATE ON entregables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_registro_horas_updated_at BEFORE UPDATE ON registro_horas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pipeline_updated_at BEFORE UPDATE ON pipeline FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_carga_mensual_updated_at BEFORE UPDATE ON carga_mensual FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (después de habilitar RLS en cada tabla)
-- ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all" ON clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
`;

/* ─────────── Toast helper ─────────── */

function useToast() {
  const [toasts, setToasts] = useState<{ id: number; message: string; type: "success" | "error" | "info"; visible: boolean }[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type, visible: true }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 4000);
  }, []);

  return { toasts, show };
}

/* ─────────── Card Wrapper ─────────── */

function SettingsCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[12px] border border-bdr bg-white shadow-sh1">
      <div className="flex items-center gap-[10px] border-b border-bdr px-[20px] py-[16px]" style={{ background: "#F7F8FA" }}>
        <Icon className="h-[18px] w-[18px] text-[#4F46E5]" />
        <h3 className="text-[13px] font-semibold text-t900">{title}</h3>
      </div>
      <div className="flex flex-col gap-[16px] p-[20px]">{children}</div>
    </div>
  );
}

/* ─────────── Main Page ─────────── */

export default function Configuracion() {
  const navigate = useNavigate();
  const data = useAppData();
  const { settings, update } = useSettings();
  const { toasts, show } = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<unknown>(null);
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");

  /* ── stats ── */
  const stats = {
    clientes: data.clientes.length,
    profesionales: data.profesionales.length,
    proyectos: data.proyectos.length,
    entregables: data.entregables.length,
    registro_horas: data.registro_horas.length,
    asignaciones_horas: data.asignaciones_horas.length,
    pipeline: data.pipeline.length,
    carga_mensual: data.carga_mensual.length,
  };

  /* ── export functions ── */
  const exportAllJSON = useCallback(() => {
    const payload = {
      clientes: data.clientes,
      profesionales: data.profesionales,
      proyectos: data.proyectos,
      entregables: data.entregables,
      asignaciones_horas: data.asignaciones_horas,
      registro_horas: data.registro_horas,
      pipeline: data.pipeline,
      carga_mensual: data.carga_mensual,
    };
    downloadBlob(JSON.stringify(payload, null, 2), "valtica_backup.json", "application/json");
    show("Exportación JSON completada", "success");
  }, [data, show]);

  const exportCSV = useCallback(
    (entity: keyof typeof stats) => {
      const rows = data[entity] as unknown[];
      if (rows.length === 0) {
        show(`No hay datos de ${entity} para exportar`, "error");
        return;
      }
      const csv = objectToCSV(rows as Record<string, unknown>[]);
      downloadBlob("\uFEFF" + csv, `valtica_${entity}.csv`, "text/csv;charset=utf-8;");
      show(`CSV de ${entity} exportado`, "success");
    },
    [data, show]
  );

  /* ── import functions ── */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || "{}"));
        setImportPreview(parsed);
        show("Archivo cargado correctamente. Revisa la vista previa.", "info");
      } catch {
        show("El archivo no es un JSON válido", "error");
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  }, [show]);

  const handleImport = useCallback(() => {
    if (!importPreview || typeof importPreview !== "object") {
      show("No hay datos válidos para importar", "error");
      return;
    }
    try {
      const keys = [
        "clientes",
        "profesionales",
        "proyectos",
        "entregables",
        "asignaciones_horas",
        "registro_horas",
        "pipeline",
        "carga_mensual",
      ];
      const valid = keys.some((k) => Array.isArray((importPreview as Record<string, unknown>)[k]));
      if (!valid) {
        show("El JSON no contiene arrays de datos reconocidos", "error");
        return;
      }
      replaceAppData(importPreview);
      show("Datos importados correctamente. Recarga la página para aplicar.", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      show("Error al importar datos", "error");
    }
  }, [importPreview, show]);

  /* ── reset functions ── */
  const handleClearAll = useCallback(() => {
    if (confirmText !== "CONFIRMAR") {
      show("Debes escribir CONFIRMAR para continuar", "error");
      return;
    }
    clearAppData();
    show("Todos los datos han sido eliminados. Recargando...", "success");
    setConfirmOpen(false);
    setConfirmText("");
    setTimeout(() => window.location.reload(), 1500);
  }, [confirmText, show]);

  const handleRestoreMock = useCallback(() => {
    clearAppData();
    show("Datos de ejemplo restaurados. Recargando...", "success");
    setTimeout(() => window.location.reload(), 1500);
  }, [show]);

  /* ── entity export buttons ── */
  const exportButtons = [
    { key: "clientes", label: "Clientes", icon: Building2 },
    { key: "profesionales", label: "Profesionales", icon: Users },
    { key: "proyectos", label: "Proyectos", icon: FolderOpen },
    { key: "entregables", label: "Entregables", icon: FileText },
    { key: "asignaciones_horas", label: "Asignaciones de horas", icon: ClipboardList },
    { key: "registro_horas", label: "Registro de Horas", icon: Clock },
    { key: "pipeline", label: "Pipeline", icon: TrendingUp },
    { key: "carga_mensual", label: "Carga Mensual", icon: CalendarDays },
  ] as const;

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-20 md:pb-0">
      <SectionHeader
        number="08"
        title="Configuración y Migración"
        hint="Gestión de datos, exportaciones y migración"
      />

      {/* Toast notifications */}
      <div className="fixed right-4 top-4 z-[1000] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-[8px] border border-bdr bg-white px-[18px] py-[14px] shadow-sh3 transition-all duration-300 ${
              t.visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
            }`}
            style={{
              borderLeftWidth: "4px",
              borderLeftColor:
                t.type === "success" ? "#047857" : t.type === "error" ? "#B91C1C" : "#4F46E5",
            }}
          >
            <span className="text-[12px] font-medium text-t700">{t.message}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-[18px]">
        {/* ── Card 1: Exportar Datos ── */}
        <SettingsCard title="Exportar Datos" icon={Download}>
          <div className="grid grid-cols-2 gap-2">
            {exportButtons.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className="inline-flex items-center gap-2 rounded-r8 border border-bdr bg-white px-3 py-2 text-[12px] font-medium text-t700 transition-all duration-150 hover:bg-[#F7F8FA] hover:border-[#C8CCDB]"
                onClick={() => exportCSV(key)}
              >
                <Icon className="h-4 w-4 text-t500" /> Exportar {label}
              </button>
            ))}
          </div>
          <button
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-r8 bg-[#4F46E5] px-4 py-[10px] text-[13px] font-semibold text-white transition-all duration-150 hover:bg-[#3730A3]"
            onClick={exportAllJSON}
          >
            <FileJson className="h-4 w-4" /> Exportar Todo (JSON)
          </button>

          <div className="mt-2 rounded-r8 border border-bdr bg-amber-50/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-amber-900">Depuración</p>
            <p className="mt-1 text-[12px] text-t700">
              Página temporal para auditar qué proyectos aportan UF y eliminar con confirmación escrita.
            </p>
            <button
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-r8 border border-bdr bg-white px-4 py-[10px] text-[13px] font-semibold text-t700 transition-all duration-150 hover:bg-[#F7F8FA]"
              onClick={() => navigate("/auditoria-proyectos")}
            >
              <AlertTriangle className="h-4 w-4 text-amber-700" /> Auditoría de Proyectos
            </button>
          </div>
        </SettingsCard>

        {/* ── Card 2: Importar Datos ── */}
        <SettingsCard title="Importar Datos" icon={Upload}>
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-bdr px-6 py-6 text-center transition-all duration-200 hover:border-[#6366F1] hover:bg-[#F6F8FF]"
          >
            <Upload className="h-6 w-6 text-t300" />
            <span className="text-[13px] font-medium text-t700">
              Arrastra un archivo JSON o haz clic para seleccionar
            </span>
            <span className="text-[10px] text-t300">Formato: objeto con claves de entidades</span>
            <input type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
          </label>

          {importPreview != null && typeof importPreview === "object" ? (
            <div className="rounded-[8px] border border-bdr bg-[#F7F8FA] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.07em] text-t300">Vista previa:</p>
              <div className="space-y-1">
                {exportButtons.map(({ key, label }) => {
                  const arr = (importPreview as Record<string, unknown>)?.[key];
                  const count = Array.isArray(arr) ? arr.length : 0;
                  return (
                    <div key={key} className="flex items-center justify-between text-[12px]">
                      <span className="text-t500">{label}</span>
                      <span
                        className="rounded-[10px] px-2 py-[2px] text-[11px] font-semibold"
                        style={{ background: "#E0E7FF", color: "#4F46E5" }}
                      >
                        {count} registros
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {importFile && (
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-r8 bg-[#B91C1C] px-4 py-[10px] text-[13px] font-semibold text-white transition-all duration-150 hover:bg-[#991B1B]"
              onClick={handleImport}
            >
              <RotateCcw className="h-4 w-4" /> Importar y Reemplazar
            </button>
          )}
        </SettingsCard>

        {/* ── Card 3: Gestión de Datos Local ── */}
        <SettingsCard title="Gestión de Datos Local" icon={Database}>
          <div className="rounded-[8px] border border-bdr bg-[#F7F8FA] p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.07em] text-t300">Estadísticas actuales</p>
            <div className="grid grid-cols-2 gap-2">
              {exportButtons.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between text-[12px]">
                  <span className="text-t500">{label}</span>
                  <span
                    className="rounded-[10px] px-2 py-[2px] font-mono text-[11px] font-semibold"
                    style={{ background: "#E0E7FF", color: "#4F46E5" }}
                  >
                    {stats[key as keyof typeof stats]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-bdr pt-3">
              <span className="text-[12px] font-semibold text-t700">Total registros</span>
              <span
                className="rounded-[10px] px-2 py-[2px] font-mono text-[11px] font-semibold"
                style={{ background: "#E0E7FF", color: "#4F46E5" }}
              >
                {Object.values(stats).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-r8 border border-bdr bg-white px-4 py-[10px] text-[13px] font-semibold text-t700 transition-all duration-150 hover:bg-[#F7F8FA]"
              onClick={handleRestoreMock}
            >
              <RotateCcw className="h-4 w-4" /> Restaurar Datos de Ejemplo
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-r8 bg-[#B91C1C] px-4 py-[10px] text-[13px] font-semibold text-white transition-all duration-150 hover:bg-[#991B1B]"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Limpiar Todo
            </button>
          </div>
        </SettingsCard>

        {/* ── Card 4: Migración a Supabase ── */}
        <SettingsCard title="Migración a Supabase" icon={Cloud}>
          <div className="rounded-[8px] border border-bdr bg-[#FEF3C7] px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#B45309]" />
              <span className="text-[11px] font-semibold text-[#B45309]">Estado: Pendiente · Sin conexión configurada</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-playfair text-[14px] font-semibold text-t900">Guía de migración paso a paso</p>

            {[
              { n: 1, title: "Crear proyecto en Supabase", desc: "Ve a supabase.com, crea un proyecto nuevo y anota la URL y API Key." },
              { n: 2, title: "Ejecutar schema SQL", desc: "Copia el SQL siguiente y ejecútalo en el SQL Editor del Dashboard." },
              { n: 3, title: "Configurar RLS policies", desc: "Habilita Row Level Security y crea policies para authenticated users." },
              { n: 4, title: "Exportar datos JSON", desc: "Usa el botón 'Exportar Todo (JSON)' de esta página para obtener el dump." },
              { n: 5, title: "Importar datos vía Dashboard", desc: "En Supabase Dashboard → Table Editor, importa cada archivo JSON a su tabla." },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
                  style={{ background: "#F7F8FA", borderColor: "#DDE1EA", color: "#9CA3AF" }}
                >
                  {step.n}
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-t700">{step.title}</p>
                  <p className="text-[10px] text-t500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* SQL Toggle */}
          <div>
            <button
              className="flex items-center gap-1 text-[11px] font-semibold text-[#4F46E5] transition-colors hover:text-[#3730A3]"
              onClick={() => setSqlExpanded((v) => !v)}
            >
              {sqlExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {sqlExpanded ? "Ocultar schema SQL" : "Ver schema SQL completo"}
            </button>
            {sqlExpanded && (
              <pre
                className="mt-2 max-h-[300px] overflow-auto rounded-[8px] border border-bdr p-3 text-[12px] leading-[1.5]"
                style={{ background: "#F7F8FA", fontFamily: '"IBM Plex Mono", monospace' }}
              >
                <code className="text-[11px] text-t700">{SUPABASE_SCHEMA_SQL}</code>
              </pre>
            )}
          </div>

          {/* Connection form */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[.07em] text-t300">Conexión (Próximamente)</p>
            <input
              type="text"
              placeholder="https://xxxx.supabase.co"
              className="rounded-[8px] border border-[#C8CCDB] px-[14px] py-[10px] text-[13px] text-t700 placeholder:text-t300 focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
            />
            <input
              type="password"
              placeholder="API Key (anon/public)"
              className="rounded-[8px] border border-[#C8CCDB] px-[14px] py-[10px] text-[13px] text-t700 placeholder:text-t300 focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
            />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-r8 border border-bdr bg-white px-4 py-[10px] text-[13px] font-semibold text-t300 transition-all duration-150"
              disabled
              title="Próximamente"
            >
              <Cloud className="h-4 w-4" /> Conectar
            </button>
          </div>
        </SettingsCard>

        {/* ── Card 5: Preferencias ── */}
        <SettingsCard title="Preferencias del Sistema" icon={Settings}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-t700">Mostrar entregables completados en Gantt</p>
                <p className="text-[10px] text-t500">Incluye barras de estado COMPLETADO en la carta Gantt</p>
              </div>
              <Switch
                checked={settings.showCompletedInGantt}
                onCheckedChange={(v) => update({ showCompletedInGantt: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-t700">Notificaciones de alertas críticas</p>
                <p className="text-[10px] text-t500">Muestra notificaciones cuando haya entregables en estado CRÍTICO</p>
              </div>
              <Switch
                checked={settings.criticalNotifications}
                onCheckedChange={(v) => update({ criticalNotifications: v })}
              />
            </div>

            <div className="border-t border-bdr pt-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[.07em] text-t300">
                Formato de fecha
              </label>
              <select
                className="w-full rounded-[8px] border border-[#C8CCDB] px-[14px] py-[10px] text-[13px] text-t700 focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
                value={settings.dateFormat}
                onChange={(e) => update({ dateFormat: e.target.value as AppSettings["dateFormat"] })}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[.07em] text-t300">
                Separador de miles
              </label>
              <select
                className="w-full rounded-[8px] border border-[#C8CCDB] px-[14px] py-[10px] text-[13px] text-t700 focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
                value={settings.thousandsSeparator}
                onChange={(e) => update({ thousandsSeparator: e.target.value as AppSettings["thousandsSeparator"] })}
              >
                <option value="punto">Punto (1.000)</option>
                <option value="coma">Coma (1,000)</option>
              </select>
            </div>
          </div>
        </SettingsCard>

        {/* ── Card 6: Información ── */}
        <SettingsCard title="Información del Sistema" icon={Info}>
          <div className="flex flex-col gap-[10px]">
            {[
              { label: "Versión de la Plataforma", value: "v1.0.0" },
              { label: "Versión del Dashboard", value: "1.0.0-planning" },
              { label: "Última exportación", value: "—" },
              { label: "Total registros en BD", value: String(Object.values(stats).reduce((a, b) => a + b, 0)) },
              { label: "Tamaño de la base de datos", value: "localStorage" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[11px] text-t500">{item.label}</span>
                <span className="font-mono text-[11px] font-medium text-[#4F46E5]">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-bdr pt-3">
            <p className="text-[11px] text-t300">Valtica Suite · Control de Proyectos</p>
            <p className="text-[10px] text-t300">© 2026 Valtica Ingeniería</p>
            <p className="text-[10px] text-t300">v1.0.0 — Desarrollado para migración a Supabase</p>
          </div>
          <a
            href="mailto:soporte@valtica.cl"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4F46E5] transition-colors hover:text-[#3730A3]"
          >
            Reportar problema
          </a>
        </SettingsCard>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-[12px] border border-bdr bg-white p-6 shadow-sh3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-playfair text-[16px] font-semibold text-t900">
              <AlertTriangle className="h-5 w-5 text-[#B91C1C]" />
              Confirmar eliminación total
            </DialogTitle>
            <DialogDescription className="text-[12px] text-t500">
              Esta acción eliminará TODOS los datos almacenados en localStorage. Escribe &quot;CONFIRMAR&quot; para continuar.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            placeholder="Escribe CONFIRMAR"
            className="mt-2 w-full rounded-[8px] border border-[#C8CCDB] px-[14px] py-[10px] text-[13px] text-t700 placeholder:text-t300 focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[rgba(99,102,241,.12)]"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <DialogFooter className="mt-4 gap-2">
            <button
              className="rounded-r8 border border-bdr bg-white px-4 py-[10px] text-[13px] font-semibold text-t700 transition-all hover:bg-[#F7F8FA]"
              onClick={() => { setConfirmOpen(false); setConfirmText(""); }}
            >
              Cancelar
            </button>
            <button
              className="rounded-r8 bg-[#B91C1C] px-4 py-[10px] text-[13px] font-semibold text-white transition-all hover:bg-[#991B1B]"
              onClick={handleClearAll}
            >
              <Trash2 className="mr-1 inline h-4 w-4" /> Eliminar Todo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
