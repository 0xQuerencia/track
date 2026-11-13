"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { LineBackdrop } from "@/components/charts/line-backdrop";
import { LineChart } from "@/components/charts/line-chart";
import { PieCenter } from "@/components/charts/pie-center";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { useChartDuration } from "@/lib/motion/use-chart-duration";

/** Sage-led palette from the design tokens, written out because SVG stops need real colours. */
export const PALETTE = [
  "#a9cbb3",
  "#a9b8ca",
  "#d5b890",
  "#b6a5c6",
  "#c3c7aa",
  "#d29a94",
] as const;

/** False while rendering on the server and during hydration, true afterwards. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function ChartEmpty({ note, height }: { note: string; height: number }) {
  return (
    <div className="tk-chart-empty" style={{ height }}>
      <p>{note}</p>
    </div>
  );
}

export function TrendChart({
  data,
  height = 200,
  color = PALETTE[0],
  emptyNote = "Nothing logged in this period yet.",
}: {
  data: { date: string; value: number }[];
  height?: number;
  color?: string;
  emptyNote?: string;
}) {
  const duration = useChartDuration(900);
  const rows = useMemo(
    () =>
      data.map((point) => ({
        date: new Date(`${point.date}T00:00:00`),
        value: point.value,
      })),
    [data],
  );
  if (rows.length < 2 || rows.every((row) => row.value === 0))
    return <ChartEmpty note={emptyNote} height={height} />;
  return (
    <LineChart
      data={rows}
      animationDuration={duration}
      aspectRatio=""
      floatingYAxis
      style={{ height }}
      margin={{ top: 12, right: 10, bottom: 22, left: 42 }}
    >
      <Grid horizontal />
      <LineBackdrop
        dataKey="value"
        side="below"
        stops={[
          { offset: 0, color, opacity: 0.16 },
          { offset: 1, color, opacity: 0 },
        ]}
      />
      <Line dataKey="value" stroke={color} strokeWidth={2} />
      <XAxis />
      <ChartTooltip />
    </LineChart>
  );
}

export function BarsChart({
  data,
  series,
  height = 200,
  emptyNote = "Nothing to chart yet.",
}: {
  data: Record<string, string | number>[];
  series: { key: string; color?: string }[];
  height?: number;
  emptyNote?: string;
}) {
  const duration = useChartDuration(900);
  const hasValues = data.some((row) =>
    series.some((s) => Number(row[s.key]) > 0),
  );
  if (!data.length || !hasValues)
    return <ChartEmpty note={emptyNote} height={height} />;
  return (
    <div style={{ height }}>
      <BarChart
        data={data}
        xDataKey="name"
        aspectRatio=""
        className="h-full"
        animationDuration={duration}
        margin={{ top: 16, right: 12, bottom: 36, left: 12 }}
      >
        <Grid horizontal />
        {series.map((s, index) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={s.color ?? PALETTE[index % PALETTE.length]}
            lineCap={4}
          />
        ))}
        <BarXAxis />
        <ChartTooltip />
      </BarChart>
    </div>
  );
}

export function Donut({
  data,
  centerLabel,
  emptyNote = "Nothing to chart yet.",
}: {
  data: { label: string; value: number }[];
  centerLabel: string;
  emptyNote?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  // The donut's centre figure animates digits client-side, so it only renders
  // after hydration; the legend beside it is plain HTML and renders on the server.
  const isClient = useIsClient();
  const items = useMemo(
    () =>
      data
        .filter((d) => d.value > 0)
        .map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length] })),
    [data],
  );
  if (!items.length) return <ChartEmpty note={emptyNote} height={148} />;
  return (
    <div className="tk-donut">
      {isClient ? (
        <PieChart
          data={items}
          size={148}
          innerRadius={50}
          padAngle={0.03}
          cornerRadius={2}
          hoverOffset={4}
          hoveredIndex={hovered}
          onHoverChange={setHovered}
        >
          {items.map((item, index) => (
            <PieSlice key={item.label} index={index} hoverEffect="grow" />
          ))}
          <PieCenter defaultLabel={centerLabel} />
        </PieChart>
      ) : (
        <div style={{ width: 148, height: 148 }} aria-hidden="true" />
      )}
      <ul className="tk-legend">
        {items.map((item, index) => (
          <li
            key={item.label}
            data-active={hovered === index || undefined}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <i style={{ background: item.color }} aria-hidden="true" />
            <span>{item.label}</span>
            <b>{new Intl.NumberFormat("en").format(Math.round(item.value))}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
