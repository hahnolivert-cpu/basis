import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";

type TooltipPayloadItem = {
  name?: string;
  value: number;
  payload: { name?: string; m?: string };
};

export function ChartTip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  total?: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
      {p.name || p.payload.name || p.payload.m}: {usd(p.value)}
      {total ? ` · ${((p.value / total) * 100).toFixed(1)}%` : ""}
    </div>
  );
}
