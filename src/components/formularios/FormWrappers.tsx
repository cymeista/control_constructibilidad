import type { ReactNode } from "react";
import { type FieldError, type UseFormRegisterReturn } from "react-hook-form";

/* ─── Form Label ─── */
export function FormLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-[6px] block text-[11px] font-semibold uppercase tracking-[0.07em] text-t600">
      {children}
      {required && <span className="ml-1 text-[#B91C1C]">*</span>}
    </label>
  );
}

/* ─── Text Input ─── */
export function FormInput({
  register,
  error,
  type = "text",
  placeholder,
  step,
}: {
  register: UseFormRegisterReturn;
  error?: FieldError;
  type?: string;
  placeholder?: string;
  step?: string;
}) {
  return (
    <input
      {...register}
      type={type}
      step={step}
      placeholder={placeholder}
      className={`w-full rounded-r8 border border-bdr2 bg-surface px-[14px] py-[10px] text-[13px] text-t900 shadow-xs outline-none transition-all duration-150 placeholder:text-t400 focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)] ${error ? "border-red" : ""}`}
    />
  );
}

/* ─── Select ─── */
export function FormSelect({
  register,
  error,
  children,
}: {
  register: UseFormRegisterReturn;
  error?: FieldError;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        {...register}
        className={`w-full appearance-none rounded-r8 border border-bdr2 bg-surface px-[14px] py-[10px] pr-10 text-[13px] text-t900 shadow-xs outline-none transition-all duration-150 focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)] ${error ? "border-red" : ""}`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t300"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

/* ─── Textarea ─── */
export function FormTextarea({
  register,
  error,
  placeholder,
  rows = 3,
}: {
  register: UseFormRegisterReturn;
  error?: FieldError;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      {...register}
      rows={rows}
      placeholder={placeholder}
      className={`w-full resize-vertical rounded-r8 border border-bdr2 bg-surface px-[14px] py-[10px] text-[13px] text-t900 shadow-xs outline-none transition-all duration-150 placeholder:text-t400 focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)] ${error ? "border-red" : ""}`}
    />
  );
}

/* ─── Error Message ─── */
export function FormError({ error }: { error?: FieldError }) {
  if (!error) return null;
  return <p className="mt-1 text-[11px] text-[#B91C1C]">{error.message}</p>;
}

/* ─── Date Input ─── */
export function FormDate({
  register,
  error,
}: {
  register: UseFormRegisterReturn;
  error?: FieldError;
}) {
  return (
    <div className="relative">
      <input
        {...register}
        type="date"
        className={`w-full rounded-r8 border border-bdr2 bg-surface px-[14px] py-[10px] pr-10 text-[13px] text-t900 shadow-xs outline-none transition-all duration-150 focus:border-copper focus:shadow-[0_0_0_3px_rgba(196,93,44,0.15)] ${error ? "border-red" : ""}`}
      />
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t300"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

/* ─── Form Row ─── */
export function FormRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${className}`}>
      {children}
    </div>
  );
}

/* ─── Form Section Divider ─── */
export function FormDivider({ label }: { label?: string }) {
  if (!label) {
    return <hr className="my-5 border-bdr" />;
  }
  return (
    <div className="my-5 flex items-center gap-3">
      <hr className="flex-1 border-bdr" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-t300">{label}</span>
      <hr className="flex-1 border-bdr" />
    </div>
  );
}
