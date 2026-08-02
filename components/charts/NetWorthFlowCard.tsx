import { Sankey, ResponsiveContainer, type SankeyNodeProps } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { subclass } from "@/lib/calc";
import { Card, Eyebrow } from "@/components/ui";
import type { Holding, Portfolio } from "@/lib/types";

const PF_LABEL: Record<Portfolio, string> = { capital: "976 Capital", personal: "Personal" };
const PF_COLOR: Record<Portfolio, string> = { capital: T.gain, personal: "#C09A5B" };
const PF_ORDER: Portfolio[] = ["capital", "personal"];
const BUCKET_COLOR: Record<string, string> = {
  Cash: "#E8A64A",
  Stocks: "#D9636B",
  ETFs: "#C6788A",
  Crypto: "#E3C567",
  "401k": "#8AA6C2",
  "Angel Investment": "#7A9B76",
};

// Buckets a holding the same way the Holdings table's Class column does
// (lib/calc.ts subclass), except 401k positions split out into their own
// row — they're not liquid brokerage equities even though asset_class
// stores them as "Equities".
function bucketFor(h: Holding): string {
  if (/401k/i.test(h.name)) return "401k";
  return subclass(h);
}

type Node = { name: string; color: string };

function buildSankey(holdings: Holding[], debts: number) {
  const nodes: Node[] = [];
  const nodeIndexOf: Record<string, number> = {};
  const addNode = (key: string, name: string, color: string) => {
    if (!(key in nodeIndexOf)) {
      nodeIndexOf[key] = nodes.length;
      nodes.push({ name, color });
    }
    return nodeIndexOf[key];
  };
  const links: { source: number; target: number; value: number }[] = [];

  for (const pf of PF_ORDER) {
    const pfHoldings = holdings.filter((h) => h.pf === pf);
    const pfTotal = pfHoldings.reduce((s, h) => s + h.value, 0);
    if (pfTotal <= 0) continue;

    const buckets = new Map<string, number>();
    for (const h of pfHoldings) buckets.set(bucketFor(h), (buckets.get(bucketFor(h)) ?? 0) + h.value);

    const pfNode = addNode(`pf:${pf}`, PF_LABEL[pf], PF_COLOR[pf]);
    Array.from(buckets.entries()).forEach(([bucket, value]) => {
      if (value <= 0) return;
      const bNode = addNode(`${pf}:${bucket}`, bucket, BUCKET_COLOR[bucket] ?? T.inkSoft);
      links.push({ source: bNode, target: pfNode, value: Math.round(value) });
    });
  }

  const total = holdings.reduce((s, h) => s + h.value, 0);
  if (total <= 0) return { nodes: [], links: [] };

  const assetsNode = addNode("assets", "Assets", T.ink);
  for (const pf of PF_ORDER) {
    const key = `pf:${pf}`;
    if (!(key in nodeIndexOf)) continue;
    const pfTotal = holdings.filter((h) => h.pf === pf).reduce((s, h) => s + h.value, 0);
    links.push({ source: nodeIndexOf[key], target: assetsNode, value: Math.round(pfTotal) });
  }

  const netWorth = total - debts;
  if (netWorth > 0) {
    const nwNode = addNode("nw", "Net Worth", T.gain);
    links.push({ source: assetsNode, target: nwNode, value: Math.round(netWorth) });
  }
  if (debts > 0) {
    const debtsNode = addNode("debts", "Debts", T.loss);
    links.push({ source: assetsNode, target: debtsNode, value: Math.round(debts) });
  }

  return { nodes, links };
}

function FlowNode({ nodes, x, y, width, height, index, payload }: SankeyNodeProps & { nodes: Node[] }) {
  const color = nodes[index]?.color ?? T.gain;
  const isLeftmost = payload.depth === 0;
  const isRightmost = !payload.sourceLinks || payload.sourceLinks.length === 0;
  const labelInside = !isLeftmost && !isRightmost;
  const label = `${payload.name}: ${usd(payload.value)}`;
  const midY = y + height / 2;

  // Pass-through nodes (portfolio, Assets) sit on a thin bar with wide pale
  // links behind them — white text drawn directly on that bar is unreadable
  // where it overflows the bar's width, so it gets a solid pill instead.
  if (labelInside) {
    const pillWidth = label.length * 6.3 + 14;
    const cx = x + width / 2;
    return (
      <g>
        <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill={color} rx={2} />
        <rect x={cx - pillWidth / 2} y={midY - 10} width={pillWidth} height={20} rx={5} fill={T.card} fillOpacity={0.96} stroke={T.line} />
        <text x={cx} y={midY} textAnchor="middle" dominantBaseline="middle" fontFamily={mono} fontSize={11} fill={T.ink}>
          {label}
        </text>
      </g>
    );
  }

  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill={color} rx={2} />
      <text
        x={isLeftmost ? x - 8 : x + width + 8}
        y={midY}
        textAnchor={isLeftmost ? "end" : "start"}
        dominantBaseline="middle"
        fontFamily={mono}
        fontSize={11}
        fill={T.ink}
      >
        {label}
      </text>
    </g>
  );
}

export function NetWorthFlowCard({ holdings, debts }: { holdings: Holding[]; debts: number }) {
  const { nodes, links } = buildSankey(holdings, debts);
  if (nodes.length === 0 || links.length === 0) return null;

  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Net worth flow · sources to net worth</Eyebrow>
      {/* The node labels need a fixed margin regardless of container width
          (Recharts has no way to shrink them proportionally), so below the
          width they were designed for the diagram itself collapses to a
          sliver and labels overlap. Scrolling horizontally at a fixed
          minWidth keeps it legible instead, same as the wide tables elsewhere. */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ height: 340, minWidth: 600 }}>
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={{ nodes, links }}
              sort={false}
              nodePadding={26}
              nodeWidth={14}
              linkCurvature={0.5}
              margin={{ top: 10, right: 150, bottom: 10, left: 130 }}
              node={(props: SankeyNodeProps) => <FlowNode {...props} nodes={nodes} />}
              link={{ stroke: T.line, strokeOpacity: 0.6, fill: T.gain, fillOpacity: 0.18 }}
            />
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
