import { useEffect, useRef, type ComponentProps } from "react";
import { Line } from "react-chartjs-2";
import type { Chart as ChartJS } from "chart.js";

type LineComponentProps = ComponentProps<typeof Line>;

type Props = Omit<LineComponentProps, "data"> & {
  data: LineComponentProps["data"] | null | undefined;
  /** Altura explícita del contenedor (Chart.js con maintainAspectRatio: false). */
  heightPx?: number;
  emptyMessage?: string;
};

/**
 * Contenedor con altura fija para react-chartjs-2.
 * Evita canvas en 0×0 cuando el padre no tiene altura calculada (común en build/producción).
 */
export default function ChartJsLineFrame({
  data,
  heightPx = 280,
  emptyMessage = "No hay datos suficientes para graficar",
  options,
  ...rest
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartJS<"line">>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(el);
    chartRef.current?.resize();
    return () => ro.disconnect();
  }, [data, heightPx]);

  const boxStyle = { height: heightPx, minHeight: heightPx } as const;

  if (!data?.labels?.length) {
    return (
      <div
        ref={containerRef}
        className="relative flex w-full min-w-0 items-center justify-center rounded-r8 border border-dashed border-bdr bg-surface2/60 px-4 text-center text-[13px] text-t500"
        style={boxStyle}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0 max-w-full" style={boxStyle}>
      <div className="absolute inset-0 min-h-0 min-w-0">
        <Line
          ref={chartRef}
          data={data}
          options={{
            ...options,
            responsive: true,
            maintainAspectRatio: false,
          }}
          {...rest}
        />
      </div>
    </div>
  );
}
