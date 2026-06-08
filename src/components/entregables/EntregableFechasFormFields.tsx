import type { EntregableFechasInput } from "@/entregables/entregableFechasValidation";

function DateField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-t500">
      {label}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-r6 border border-bdr bg-white px-2 text-[12px] text-t800 disabled:opacity-60"
      />
    </label>
  );
}

type Props = {
  draft: EntregableFechasInput;
  conRevisiones: boolean;
  onChange: (patch: Partial<EntregableFechasInput>) => void;
};

export function EntregableFechasFormFields({ draft, conRevisiones, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateField label="Fecha inicio" value={draft.fecha_inicio} onChange={(v) => onChange({ fecha_inicio: v })} />
      <DateField label="Fecha término" value={draft.fecha_termino} onChange={(v) => onChange({ fecha_termino: v })} />
      {conRevisiones ? (
        <>
          <DateField
            label="Revisión A"
            value={draft.fecha_revA ?? ""}
            onChange={(v) => onChange({ fecha_revA: v })}
          />
          <DateField
            label="Revisión B"
            value={draft.fecha_revB ?? ""}
            onChange={(v) => onChange({ fecha_revB: v })}
          />
          <DateField
            label="Revisión P"
            value={draft.fecha_revP ?? ""}
            onChange={(v) => onChange({ fecha_revP: v })}
          />
        </>
      ) : (
        <div className="sm:col-span-2 text-[11px] text-t600">
          Rev.P se iguala automáticamente a la fecha de término.
        </div>
      )}
    </div>
  );
}
