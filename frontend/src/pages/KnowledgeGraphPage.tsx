import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from "react-force-graph-2d";
import "../styles/knowledge-graph.css";

type GraphNodeType =
  | "Transaction"
  | "Merchant"
  | "Category"
  | "Item"
  | "Beneficiary"
  | "PaymentMethod";

type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  data: Record<string, unknown>;
};

type GraphEdge = {
  source: string;
  target: string;
  rel: string;
  data?: Record<string, unknown>;
};

type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  transaction_count: number;
};

type FgNode = NodeObject<GraphNode>;
type FgLink = LinkObject<GraphNode, GraphEdge>;

const NODE_COLORS: Record<GraphNodeType, string> = {
  Transaction: "#0c1f1a",
  Merchant: "#8fbc3a",
  Category: "#5a7268",
  Item: "#16352c",
  Beneficiary: "#c45c4a",
  PaymentMethod: "#e08a3c",
};

function nodeColor(type: string): string {
  return NODE_COLORS[type as GraphNodeType] ?? "#5a7268";
}

export function KnowledgeGraphPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<FgNode, FgLink> | undefined>(
    undefined,
  );
  const [dims, setDims] = useState({ width: 800, height: 560 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [hoverLink, setHoverLink] = useState<FgLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/graph/");
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as GraphResponse;
      setGraph(json);
      setSelected(null);
      setDetailExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setDims({
        width: Math.max(320, Math.floor(rect.width)),
        height: Math.max(360, Math.floor(rect.height)),
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!graph) return { nodes: [] as FgNode[], links: [] as FgLink[] };
    return {
      nodes: graph.nodes.map((n) => ({ ...n })) as FgNode[],
      links: graph.edges.map((e) => ({ ...e })) as FgLink[],
    };
  }, [graph]);

  const paintNode = useCallback(
    (node: FgNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.label || node.id;
      const fontSize = Math.max(10 / globalScale, 2.4);
      const radius = node.type === "Transaction" ? 7 : 5.5;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isSelected = selected?.id === node.id;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = nodeColor(node.type);
      ctx.fill();

      if (isSelected) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = "#0c1f1a";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, radius + 3 / globalScale, 0, 2 * Math.PI);
        ctx.lineWidth = 1.5 / globalScale;
        ctx.strokeStyle = "#8fbc3a";
        ctx.stroke();
      }

      ctx.font = `${fontSize}px "DM Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#16352c";
      ctx.fillText(label, x, y + radius + 1.5);
    },
    [selected],
  );

  const empty = !loading && graph && graph.nodes.length === 0;

  return (
    <section className="kg" aria-label="Knowledge Graph">
      <header className="kg-header">
        <div>
          <p className="kg-kicker">Ontology</p>
          <h1 className="kg-title">Knowledge Graph</h1>
        </div>
        <div className="kg-header-actions">
          <p className="kg-meta" aria-live="polite">
            {loading
              ? "Loading…"
              : graph
                ? `${graph.transaction_count} txns · ${graph.nodes.length} nodes · ${graph.edges.length} edges`
                : "—"}
          </p>
          <button
            type="button"
            className="kg-refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="kg-legend" aria-label="Node types">
        {(Object.keys(NODE_COLORS) as GraphNodeType[]).map((type) => (
          <span key={type} className="kg-legend-item">
            <span
              className="kg-legend-dot"
              style={{ background: NODE_COLORS[type] }}
              aria-hidden
            />
            {type}
          </span>
        ))}
      </div>

      {error ? (
        <p className="kg-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="kg-body">
        <div className="kg-canvas" ref={containerRef}>
          {empty ? (
            <p className="kg-empty">
              No transactions yet. Log something in Chat to grow the graph.
            </p>
          ) : null}

          {!empty && graph ? (
            <ForceGraph2D
              ref={graphRef}
              width={dims.width}
              height={dims.height}
              graphData={graphData}
              nodeId="id"
              linkSource="source"
              linkTarget="target"
              backgroundColor="rgba(0,0,0,0)"
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={(node, color, ctx) => {
                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, 8, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              }}
              linkColor={() => "rgba(12, 31, 26, 0.28)"}
              linkWidth={(link) => (link === hoverLink ? 2.2 : 1.1)}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              linkLabel={(link) => link.rel}
              onLinkHover={(link) => setHoverLink(link)}
              onNodeClick={(node) => {
                const next: GraphNode = {
                  id: node.id as string,
                  type: node.type,
                  label: node.label,
                  data: node.data ?? {},
                };
                if (selected?.id === next.id) {
                  setDetailExpanded((open) => !open);
                  return;
                }
                setSelected(next);
                setDetailExpanded(true);
              }}
              onBackgroundClick={() => {
                setSelected(null);
                setDetailExpanded(true);
              }}
              cooldownTicks={90}
              onEngineStop={() => graphRef.current?.zoomToFit(400, 48)}
            />
          ) : null}

          {loading ? <p className="kg-loading">Building graph…</p> : null}
        </div>

        <aside
          className={`kg-detail${selected ? " is-open" : ""}${
            selected && detailExpanded ? " is-expanded" : ""
          }`}
          aria-live="polite"
          aria-hidden={!selected}
        >
          {selected ? (
            <>
              <button
                type="button"
                className="kg-detail-handle"
                aria-expanded={detailExpanded}
                onClick={() => setDetailExpanded((open) => !open)}
              >
                <span className="kg-detail-handle-text">
                  <span className="kg-detail-type">{selected.type}</span>
                  <span className="kg-detail-label">{selected.label}</span>
                </span>
                <span className="kg-detail-toggle">
                  {detailExpanded ? "Collapse" : "Expand"}
                </span>
              </button>
              <div className="kg-detail-body">
                <div className="kg-detail-body-inner">
                  <p className="kg-detail-id">{selected.id}</p>
                  <dl className="kg-detail-data">
                    {Object.entries(selected.data).map(([key, value]) => (
                      <div key={key} className="kg-detail-row">
                        <dt>{key}</dt>
                        <dd>{value == null ? "null" : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
