"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

interface BarConfig {
  dataKey: string;
  label: string;
  color: string;
}

interface ThemedBarChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  bars: BarConfig[];
  height?: number;
  stacked?: boolean;
  colorByValue?: boolean;
  positiveColor?: string;
  negativeColor?: string;
}

export function ThemedBarChart({
  data,
  xKey,
  bars,
  height = 300,
  stacked = false,
  colorByValue = false,
  positiveColor = "#00e1ff",
  negativeColor = "#ff3c22",
}: ThemedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#b6c0d9", fontSize: 12 }}
          stroke="rgba(255,255,255,0.12)"
        />
        <YAxis
          tick={{ fill: "#b6c0d9", fontSize: 12 }}
          stroke="rgba(255,255,255,0.12)"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(2,7,22,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "0.75rem",
            color: "#f5f8ff",
            fontSize: 13,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#b6c0d9" }} />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.label}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
            stackId={stacked ? "stack" : undefined}
          >
            {colorByValue &&
              data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    (entry[bar.dataKey] as number) >= 0
                      ? positiveColor
                      : negativeColor
                  }
                />
              ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
