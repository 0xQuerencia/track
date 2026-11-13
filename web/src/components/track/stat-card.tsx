"use client";

import { CountUp } from "@/components/motion/count-up";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** A key figure that counts up on arrival. Formatting is chosen by plain props so server pages can use it. */
export function StatCard({
  label,
  value,
  decimals = 0,
  suffix = "",
  currency = false,
  hint,
  tone,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
  currency?: boolean;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  const format = (n: number) =>
    currency
      ? inr.format(n)
      : `${new Intl.NumberFormat("en", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(n)}${suffix}`;
  return (
    <div className="tk-stat" data-tone={tone}>
      <span className="tk-stat-label">{label}</span>
      <strong className="tk-stat-value">
        {value === null ? "—" : <CountUp value={value} format={format} />}
      </strong>
      {hint ? <span className="tk-stat-hint">{hint}</span> : null}
    </div>
  );
}
