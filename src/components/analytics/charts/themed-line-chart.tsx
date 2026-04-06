"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LineConfig {
  dataKey: string;
  label: string;
  color: string;
  dashed?: boolean;
}

interface ThemedLineChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  lines: LineConfig[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
}

export function ThemedLineChart({
  data,
  xKey,
  lines,
  height = 300,
}: ThemedLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#b6c0d9" }}
        />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.label}
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray={line.dashed ? "5 5" : undefined}
            dot={{ r: 3, fill: line.color }}
            activeDot={{ r: 5, fill: line.color }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
