import type { PreguntaEvaluacionEntregable } from "@/context/AppDataContext";

const TS = "2026-01-01T00:00:00.000Z";

function base(
  id: string,
  tipo: "TALLER" | "ENTREGABLE",
  categoria: string,
  texto: string,
  orden: number,
): PreguntaEvaluacionEntregable {
  return {
    id,
    tipo_evaluacion: tipo,
    categoria,
    texto,
    activa: true,
    orden,
    origen: "BASE",
    created_at: TS,
    updated_at: TS,
  };
}

/** Preguntas base inmutables por id; se fusionan si faltan en persistencia. */
export const PREGUNTAS_EVALUACION_BASE: PreguntaEvaluacionEntregable[] = [
  base(
    "base-taller-1",
    "TALLER",
    "Cumplimiento de acuerdos",
    "El taller cumplió con las fechas de revisión interna comprometidas.",
    1,
  ),
  base(
    "base-taller-2",
    "TALLER",
    "Cumplimiento de acuerdos",
    "El taller se desarrolló dentro del plazo previsto, sin requerir extensiones atribuibles a falta de avance interno.",
    2,
  ),
  base(
    "base-taller-3",
    "TALLER",
    "Cumplimiento de acuerdos",
    "Al momento del dry run interno, el taller se encontraba completo y con la información clave disponible para el análisis.",
    3,
  ),
  base(
    "base-taller-4",
    "TALLER",
    "Gestión del desarrollo",
    "La solicitud de apoyo se realizó con anticipación suficiente respecto de la fecha de entrega.",
    4,
  ),
  base(
    "base-taller-5",
    "TALLER",
    "Gestión del desarrollo",
    "Los comentarios realizados por los revisores fueron resueltos oportunamente antes de la entrega o presentación.",
    5,
  ),
  base(
    "base-taller-6",
    "TALLER",
    "Gestión del cierre",
    "Los hallazgos fueron categorizados y se asignaron responsables dentro de las 24 horas posteriores al taller.",
    6,
  ),
  base(
    "base-taller-7",
    "TALLER",
    "Gestión del cierre",
    "Se realizó coordinación con Ingeniería para revisar los hallazgos y definir el tratamiento de aquellos externos a Construcción.",
    7,
  ),
  base(
    "base-taller-8",
    "TALLER",
    "Excelencia",
    "La presentación no presentó faltas de ortografía, textos mal redactados o inconsistencias evidentes.",
    8,
  ),
  base(
    "base-taller-9",
    "TALLER",
    "Excelencia",
    "La presentación mantuvo una línea gráfica homogénea, incluyendo paleta de colores, tipografía, formato de unidades, superíndices y elementos visuales.",
    9,
  ),
  base(
    "base-entregable-1",
    "ENTREGABLE",
    "Cumplimiento de acuerdos",
    "El entregable cumplió con las fechas de revisión interna comprometidas.",
    1,
  ),
  base(
    "base-entregable-2",
    "ENTREGABLE",
    "Cumplimiento de acuerdos",
    "El entregable se desarrolló dentro del plazo previsto, sin requerir extensiones atribuibles a falta de avance interno.",
    2,
  ),
  base(
    "base-entregable-3",
    "ENTREGABLE",
    "Gestión del desarrollo",
    "La solicitud de apoyo se realizó con anticipación suficiente respecto de la fecha de entrega.",
    3,
  ),
  base(
    "base-entregable-4",
    "ENTREGABLE",
    "Gestión del desarrollo",
    "Los comentarios realizados por los revisores fueron resueltos oportunamente antes de la emisión o entrega final.",
    4,
  ),
  base(
    "base-entregable-5",
    "ENTREGABLE",
    "Excelencia",
    "El documento no presentó faltas de ortografía, textos mal redactados o inconsistencias evidentes.",
    5,
  ),
  base(
    "base-entregable-6",
    "ENTREGABLE",
    "Excelencia",
    "El documento respetó el template, tipografía, formato de unidades, superíndices y elementos necesarios para una presentación adecuada.",
    6,
  ),
];

const BASE_BY_ID = new Map(PREGUNTAS_EVALUACION_BASE.map((b) => [b.id, b]));

/** Sincroniza solo plantillas BASE (texto/categoría/orden); no altera evaluaciones guardadas. */
export function ensurePreguntasEvaluacionBase(
  stored: PreguntaEvaluacionEntregable[] | undefined,
): PreguntaEvaluacionEntregable[] {
  const list = Array.isArray(stored) ? [...stored] : [];
  const ids = new Set(list.map((p) => p.id));

  for (let i = 0; i < list.length; i++) {
    const row = list[i]!;
    const seed = BASE_BY_ID.get(row.id);
    if (!seed || row.origen !== "BASE") continue;
    list[i] = {
      ...row,
      tipo_evaluacion: seed.tipo_evaluacion,
      categoria: seed.categoria,
      texto: seed.texto,
      orden: seed.orden,
    };
  }

  for (const b of PREGUNTAS_EVALUACION_BASE) {
    if (!ids.has(b.id)) list.push(b);
  }
  return list.sort((a, b) => {
    if (a.tipo_evaluacion !== b.tipo_evaluacion) {
      return a.tipo_evaluacion.localeCompare(b.tipo_evaluacion);
    }
    return a.orden - b.orden;
  });
}
