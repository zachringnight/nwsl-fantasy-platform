"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

interface RadarConfig {
  dataKey: string;
  label: string;
  color: string;
  fillOpacity?: number;
}

interface ThemedRadarChartProps {
  data: Array<{ subject: string; [key: string]: unknown }>;
  radars: RadarConfig[];
  height?: number;
}

export function ThemedRadarChart({
  data,
  radars,
  height = 320,
}: ThemedRadarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.1)" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "#b6c0d9", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          tick={{ fill: "#b6c0d9", fontSize: 10 }}
          stroke="rgba(255,255,255,0.08)"
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
        {radars.map((r) => (
          <Radar
            key={r.dataKey}
            name={r.label}
            dataKey={r.dataKey}
            stroke={r.color}
            fill={r.color}
            fillOpacity={r.fillOpacity ?? 0.2}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
