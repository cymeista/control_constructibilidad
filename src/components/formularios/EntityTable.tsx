import { useState, type ReactNode } from "react";
import { Pencil, Trash2, Inbox, Search } from "lucide-react";
import DataTable from "@/components/DataTable";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  /** Sustituye `whitespace-nowrap` por defecto (ej. `whitespace-normal max-w-[240px]`). */
  tdClassName?: string;
}

interface EntityTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  entityLabel: string;
  /** Campos del propio `item` que participan en la búsqueda (se unen en minúsculas). */
  searchFields: (keyof T)[];
  /**
   * Texto adicional indexable (nombres desde relaciones, códigos mostrados en columnas `render`, etc.).
   * Sin esto, la búsqueda solo ve datos planos del modelo y puede “fallar” frente a lo que el usuario ve en tabla.
   */
  searchExtraText?: (item: T) => string;
  /**
   * Cuando `data` llega vacío por filtros externos pero aún hay registros en el dominio (mensaje distinto al seed vacío).
   */
  emptyWhenNoRows?: { title: string; subtitle?: string };
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  /** Acciones extra antes de editar/eliminar (ej. cerrar asignación). */
  extraRowActions?: (item: T) => ReactNode;
  /** Contenido de la card en móvil (sin botones de acción; se añaden automáticamente). */
  renderMobileCard?: (item: T) => ReactNode;
  /** Acciones extra en el pie de la card móvil (ej. Normalizar). */
  renderMobileCardExtra?: (item: T) => ReactNode;
}

function buildSearchBlob<T extends { id: string }>(
  item: T,
  searchFields: (keyof T)[],
  searchExtraText?: (row: T) => string,
): string {
  const parts: string[] = [];
  if (searchExtraText) {
    const extra = searchExtraText(item);
    if (extra) parts.push(extra);
  }
  for (const field of searchFields) {
    const val = item[field];
    if (val != null && val !== "") parts.push(String(val));
  }
  return parts.join(" ").toLowerCase();
}

export default function EntityTable<T extends { id: string }>({
  data,
  columns,
  entityLabel,
  searchFields,
  searchExtraText,
  emptyWhenNoRows,
  onEdit,
  onDelete,
  extraRowActions,
  renderMobileCard,
  renderMobileCardExtra,
}: EntityTableProps<T>) {
  const isBelowMd = useIsBelowMd();
  const useMobileCards = isBelowMd && !!renderMobileCard;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const termNorm = search.trim().toLowerCase();

  const filtered = data.filter((item) => {
    if (!termNorm) return true;
    const blob = buildSearchBlob(item, searchFields, searchExtraText);
    return blob.includes(termNorm);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const emptyTitle =
    filtered.length === 0 && data.length > 0 && termNorm
      ? "Sin resultados para la búsqueda"
      : filtered.length === 0 && data.length === 0 && emptyWhenNoRows
        ? emptyWhenNoRows.title
        : `No hay registros de ${entityLabel.toLowerCase()}`;
  const emptySubtitle =
    filtered.length === 0 && data.length > 0 && termNorm
      ? "Probá con otro término o limpiá el buscador."
      : filtered.length === 0 && data.length === 0 && emptyWhenNoRows?.subtitle
        ? emptyWhenNoRows.subtitle
        : filtered.length === 0 && data.length === 0 && !emptyWhenNoRows
          ? "Crea el primer registro usando el formulario arriba"
          : undefined;

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t300" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`Buscar ${entityLabel.toLowerCase()}...`}
            className="w-full rounded-r8 border border-[#C8CCDB] bg-white py-[10px] pl-9 pr-[14px] text-[13px] text-t900 shadow-xs outline-none transition-all duration-150 placeholder:text-t300 focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
          />
        </div>
        <span className="shrink-0 text-[11px] text-t300">
          {filtered.length} de {data.length} registros
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-r12 border border-bdr bg-white py-16 shadow-sh1">
          <Inbox className="mb-3 h-8 w-8 text-t300 opacity-25" />
          <p className="text-[13px] text-t300">{emptyTitle}</p>
          {emptySubtitle ? (
            <p className="mt-1 max-w-md px-4 text-center text-[11.5px] text-t300">{emptySubtitle}</p>
          ) : null}
        </div>
      ) : useMobileCards ? (
        <>
          <div className="space-y-3">
            {paginated.map((item) => (
              <article
                key={item.id}
                className="min-w-0 max-w-full overflow-hidden rounded-r12 border border-bdr bg-white p-4 shadow-sh1"
              >
                <div className="space-y-2">{renderMobileCard!(item)}</div>
                {renderMobileCardExtra?.(item) ? (
                  <div className="mt-3 border-t border-bdr/60 pt-3">{renderMobileCardExtra(item)}</div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-bdr pt-3">
                  {extraRowActions?.(item)}
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[12px] font-semibold text-t700 transition-colors hover:bg-bluebg hover:text-blue sm:flex-none"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-r8 border border-bdr bg-surface2 px-3 py-2 text-[12px] font-semibold text-t700 transition-colors hover:bg-[#FEF2F2] hover:text-[#B91C1C] sm:flex-none"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-t500">
              <span>
                Mostrando {paginated.length} de {filtered.length}
              </span>
              <span>
                Página {page} de {totalPages}
              </span>
            </div>
          ) : (
            <p className="text-[12px] text-t500">
              Mostrando {paginated.length} de {filtered.length}
            </p>
          )}
        </>
      ) : (
        <DataTable
          headers={[...columns.map((c) => c.header), "Acciones"]}
          footerLeft={`Mostrando ${paginated.length} de ${filtered.length}`}
          footerRight={`Página ${page} de ${totalPages}`}
        >
          {paginated.map((item) => (
            <tr
              key={item.id}
              className="border-b border-bdr transition-colors duration-100 hover:bg-[#F6F8FF]"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-[14px] py-[9px] text-[12.5px] text-t900 ${col.tdClassName ?? "whitespace-nowrap"}`}
                >
                  {col.render ? col.render(item) : String((item as Record<string, unknown>)[col.key] ?? "—")}
                </td>
              ))}
              <td className="whitespace-nowrap px-[14px] py-[9px]">
                <div className="flex items-center gap-2">
                  {extraRowActions?.(item)}
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="inline-flex items-center rounded-r4 p-1.5 text-t500 transition-colors hover:bg-bluebg hover:text-blue"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="inline-flex items-center rounded-r4 p-1.5 text-t500 transition-colors hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {/* Pagination */}
      {filtered.length > 0 && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={`h-9 min-w-[36px] rounded-r4 px-2 text-[11.5px] font-medium transition-colors ${
                p === page
                  ? "bg-blue text-white"
                  : "border border-bdr bg-white text-t500 hover:bg-surface2"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
