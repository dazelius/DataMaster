import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type SimulationNodeDatum, type SimulationLinkDatum,
} from 'd3-force';
import { api } from '../../lib/api';

/* ── Types ───────────────────────────────────────── */

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  category: string;
  nodeType: 'page' | 'tag' | 'unresolved';
  linkCount: number;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface WikiGraphData {
  nodes: { id: string; title: string; category: string; nodeType?: string }[];
  edges: { source: string; target: string }[];
}

interface Props {
  focusedPage?: string;
  onPageClick: (path: string) => void;
  compact?: boolean;
}

/* ── Category Colors ─────────────────────────────── */

const CATEGORY_COLORS: Record<string, { fill: string; glow: string }> = {
  _policies:   { fill: '#f472b6', glow: '#f472b6' },
  entities:    { fill: '#c084fc', glow: '#c084fc' },
  concepts:    { fill: '#60a5fa', glow: '#60a5fa' },
  analysis:    { fill: '#34d399', glow: '#34d399' },
  guides:      { fill: '#fbbf24', glow: '#fbbf24' },
  tag:         { fill: '#4ade80', glow: '#4ade80' },
  unresolved:  { fill: '#6b7280', glow: '#6b7280' },
  root:        { fill: '#94a3b8', glow: '#94a3b8' },
  _other:      { fill: '#94a3b8', glow: '#94a3b8' },
};

function getColor(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS._other;
}

/* ── Helpers ─────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/* ── Particle System ─────────────────────────────── */

interface Particle {
  edgeIdx: number;
  t: number;
  speed: number;
  size: number;
  alpha: number;
}

function createParticles(edgeCount: number, count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      edgeIdx: Math.floor(Math.random() * Math.max(1, edgeCount)),
      t: Math.random(),
      speed: 0.002 + Math.random() * 0.004,
      size: 1 + Math.random() * 1.5,
      alpha: 0.3 + Math.random() * 0.5,
    });
  }
  return particles;
}

/* ── Graph View ──────────────────────────────────── */

export function WikiGraphView({ focusedPage, onPageClick, compact = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  const [graphData, setGraphData] = useState<WikiGraphData | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const hoveredRef = useRef<GraphNode | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState<GraphNode | null>(null);
  const draggingRef = useRef<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const dimensionsRef = useRef({ w: 800, h: 600 });

  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const hasZoomedToFit = useRef(false);

  const focusedNeighborsRef = useRef<Set<string>>(new Set());

  const zoomToFit = useCallback((padding = 60, filterIds?: Set<string>) => {
    const allNodes = nodesRef.current;
    if (allNodes.length === 0) return;
    const { w, h } = dimensionsRef.current;
    if (w < 10 || h < 10) return;

    const arr = filterIds && filterIds.size > 0
      ? allNodes.filter((n) => filterIds.has(n.id))
      : allNodes;
    if (arr.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of arr) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    if (!isFinite(minX)) return;
    const graphW = maxX - minX || 1;
    const graphH = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const k = Math.max(0.2, Math.min(
      (w - padding * 2) / graphW,
      (h - padding * 2) / graphH,
      5,
    ));
    const newTransform = { x: -cx * k, y: -cy * k, k };
    setTransform(newTransform);
    transformRef.current = newTransform;
  }, []);

  useEffect(() => { transformRef.current = transform; }, [transform]);
  useEffect(() => { dimensionsRef.current = dimensions; }, [dimensions]);
  useEffect(() => { hoveredRef.current = hoveredNode; }, [hoveredNode]);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<WikiGraphData>('/api/wiki/graph');
        setGraphData(data);
      } catch { /* server not ready */ }
    })();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 10 && h > 10) {
        dimensionsRef.current = { w, h };
        setDimensions({ w, h });
      }
    });
    ro.observe(el);

    const mountTimer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const mw = Math.round(r.width);
      const mh = Math.round(r.height);
      if (mw > 10 && mh > 10) {
        dimensionsRef.current = { w: mw, h: mh };
        setDimensions({ w: mw, h: mh });
      }
    }, 100);

    return () => { ro.disconnect(); clearTimeout(mountTimer); };
  }, [compact]);

  const { nodes, edges, focusedNeighbors, neighborEdges } = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [], focusedNeighbors: new Set<string>(), neighborEdges: new Set<number>() };

    const linkCounts = new Map<string, number>();
    for (const e of graphData.edges) {
      linkCounts.set(e.source, (linkCounts.get(e.source) ?? 0) + 1);
      linkCounts.set(e.target, (linkCounts.get(e.target) ?? 0) + 1);
    }

    const gNodes: GraphNode[] = graphData.nodes.map((n, i) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      nodeType: (n.nodeType as 'page' | 'tag' | 'unresolved') ?? 'page',
      linkCount: linkCounts.get(n.id) ?? 0,
      x: Math.cos((2 * Math.PI * i) / graphData.nodes.length) * 150,
      y: Math.sin((2 * Math.PI * i) / graphData.nodes.length) * 150,
    }));

    const nodeIds = new Set(gNodes.map((n) => n.id));
    const gEdges: GraphEdge[] = graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    const neighbors = new Set<string>();
    const nEdges = new Set<number>();
    if (focusedPage) {
      neighbors.add(focusedPage);
      gEdges.forEach((e, idx) => {
        const src = typeof e.source === 'string' ? e.source : e.source.id;
        const tgt = typeof e.target === 'string' ? e.target : e.target.id;
        if (src === focusedPage || tgt === focusedPage) {
          neighbors.add(src);
          neighbors.add(tgt);
          nEdges.add(idx);
        }
      });
    }

    focusedNeighborsRef.current = neighbors;
    return { nodes: gNodes, edges: gEdges, focusedNeighbors: neighbors, neighborEdges: nEdges };
  }, [graphData, focusedPage]);

  useEffect(() => {
    if (nodes.length === 0) return;

    nodesRef.current = nodes.map((n) => ({ ...n }));
    edgesRef.current = edges.map((e) => ({ ...e }));

    const particleCount = compact ? Math.min(edges.length * 2, 20) : Math.min(edges.length * 3, 60);
    particlesRef.current = createParticles(edges.length, particleCount);

    const sim = forceSimulation<GraphNode>(nodesRef.current)
      .force('link', forceLink<GraphNode, GraphEdge>(edgesRef.current)
        .id((d) => d.id)
        .distance((d) => {
          const src = d.source as GraphNode;
          const tgt = d.target as GraphNode;
          if (src.nodeType === 'tag' || tgt.nodeType === 'tag') return compact ? 40 : 80;
          if (src.nodeType === 'unresolved' || tgt.nodeType === 'unresolved') return compact ? 50 : 90;
          return compact ? 70 : 160;
        })
        .strength(0.4))
      .force('charge', forceManyBody<GraphNode>()
        .strength((d) => {
          if (d.nodeType === 'tag') return compact ? -30 : -100;
          if (d.nodeType === 'unresolved') return compact ? -40 : -120;
          return (compact ? -120 : -400) - d.linkCount * 25;
        }))
      .force('center', forceCenter(0, 0).strength(0.1))
      .force('collide', forceCollide<GraphNode>()
        .radius((d) => nodeRadius(d) + (compact ? 10 : 20))
        .strength(0.7))
      .alphaDecay(0.015)
      .velocityDecay(0.35);

    hasZoomedToFit.current = false;

    const getFitSet = () => compact && focusedNeighborsRef.current.size > 0 ? focusedNeighborsRef.current : undefined;
    const fitTimer = setTimeout(() => {
      if (!hasZoomedToFit.current) {
        zoomToFit(compact ? 20 : 40, getFitSet());
        hasZoomedToFit.current = true;
      }
    }, 1200);

    simRef.current = sim;
    return () => {
      sim.stop();
      cancelAnimationFrame(animRef.current);
      clearTimeout(fitTimer);
    };
  }, [nodes, edges, compact, zoomToFit]);

  const nodeRadius = useCallback((n: GraphNode) => {
    if (n.nodeType === 'tag') {
      const base = compact ? 2 : 3;
      return base + Math.min(n.linkCount * 0.8, 5);
    }
    if (n.nodeType === 'unresolved') {
      return compact ? 2 : 3;
    }
    const base = compact ? 3.5 : 5;
    return base + Math.min(n.linkCount * 1.8, 10);
  }, [compact]);

  /* ── Render ────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !simRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    function draw() {
      if (!ctx || !canvas) return;
      timeRef.current += 0.016;
      const t = timeRef.current;
      const { w, h } = dimensionsRef.current;
      const tr = transformRef.current;
      const hovered = hoveredRef.current;
      const isDragging = !!draggingRef.current;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // BG gradient
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, '#1e1f2e');
      bg.addColorStop(1, '#13141f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2 + tr.x, h / 2 + tr.y);
      ctx.scale(tr.k, tr.k);

      const edgeArr = edgesRef.current;
      const nodeArr = nodesRef.current;
      const hasFocus = !!focusedPage;

      /* ── Edges ── */
      for (let i = 0; i < edgeArr.length; i++) {
        const edge = edgeArr[i];
        const src = edge.source as GraphNode;
        const tgt = edge.target as GraphNode;
        if (src.x == null || tgt.x == null) continue;

        const isFocusEdge = hasFocus && neighborEdges.has(i);
        const isHoverEdge = hovered && !hasFocus && (src.id === hovered.id || tgt.id === hovered.id);

        let alpha: number;
        let width: number;
        let color: string;

        if (isFocusEdge) {
          alpha = 0.5; width = 1.8; color = getColor(src.category).glow;
        } else if (isHoverEdge) {
          alpha = 0.4; width = 1.5; color = getColor(hovered!.category).glow;
        } else if (hasFocus || hovered) {
          alpha = 0.04; width = 0.5; color = '#64748b';
        } else {
          alpha = 0.12; width = 0.6; color = '#64748b';
        }

        // Curved edge (quadratic bezier)
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = Math.min(dist * 0.08, 15);
        const cx = mx + (-dy / dist) * curvature;
        const cy = my + (dx / dist) * curvature;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.quadraticCurveTo(cx, cy, tgt.x, tgt.y);
        const [r, g, b] = hexToRgb(color);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = width;
        ctx.stroke();

        // Arrow head
        if (!compact && alpha > 0.08) {
          const tgtR = nodeRadius(tgt);
          const adx = tgt.x - cx;
          const ady = tgt.y - cy;
          const aLen = Math.sqrt(adx * adx + ady * ady) || 1;
          const ax = tgt.x - (adx / aLen) * tgtR;
          const ay = tgt.y - (ady / aLen) * tgtR;
          const angle = Math.atan2(ady, adx);
          const arrowSize = 4 + width;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - arrowSize * Math.cos(angle - 0.4), ay - arrowSize * Math.sin(angle - 0.4));
          ctx.lineTo(ax - arrowSize * Math.cos(angle + 0.4), ay - arrowSize * Math.sin(angle + 0.4));
          ctx.closePath();
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
          ctx.fill();
        }
      }

      /* ── Particles ── */
      if (!compact || !hasFocus) {
        for (const p of particlesRef.current) {
          p.t += p.speed;
          if (p.t > 1) { p.t = 0; p.edgeIdx = Math.floor(Math.random() * Math.max(1, edgeArr.length)); }
          if (p.edgeIdx >= edgeArr.length) continue;

          const edge = edgeArr[p.edgeIdx];
          const src = edge.source as GraphNode;
          const tgt = edge.target as GraphNode;
          if (src.x == null || tgt.x == null) continue;

          const isFocusEdge = hasFocus && neighborEdges.has(p.edgeIdx);
          const isHoverEdge = hovered && !hasFocus && (src.id === hovered.id || tgt.id === hovered.id);

          let pAlpha = p.alpha * 0.5;
          if (isFocusEdge) pAlpha = p.alpha * 0.9;
          else if (isHoverEdge) pAlpha = p.alpha * 0.7;
          else if (hasFocus || hovered) pAlpha = p.alpha * 0.05;

          const tt = p.t;
          const px = lerp(lerp(src.x, (src.x + tgt.x) / 2, tt), lerp((src.x + tgt.x) / 2, tgt.x, tt), tt);
          const py = lerp(lerp(src.y, (src.y + tgt.y) / 2, tt), lerp((src.y + tgt.y) / 2, tgt.y, tt), tt);

          const col = isFocusEdge || isHoverEdge ? getColor(src.category).glow : '#94a3b8';
          const [pr, pg, pb] = hexToRgb(col);

          ctx.beginPath();
          ctx.arc(px, py, p.size * tr.k, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${pr},${pg},${pb},${pAlpha})`;
          ctx.fill();
        }
      }

      /* ── Nodes ── */
      for (const node of nodeArr) {
        if (node.x == null || node.y == null) continue;

        const r = nodeRadius(node);
        const col = getColor(node.category);
        const isFocused = node.id === focusedPage;
        const isNeighbor = hasFocus && focusedNeighbors.has(node.id);
        const isHovered = hovered?.id === node.id;
        const isHoverNeighbor = !hasFocus && hovered && edgeArr.some((e) => {
          const s = (e.source as GraphNode).id;
          const tt = (e.target as GraphNode).id;
          return (s === hovered.id && tt === node.id) || (tt === hovered.id && s === node.id);
        });
        const isDimmed = (hasFocus && !isNeighbor) || (hovered && !hasFocus && !isHovered && !isHoverNeighbor);

        // Breathing animation
        const breathe = 1 + Math.sin(t * 2 + node.x * 0.01) * 0.08;
        const finalR = r * (isHovered ? 1.4 : isFocused ? 1.2 : breathe);

        // Outer glow
        if (isFocused || isHovered || isHoverNeighbor) {
          const glowR = finalR * (isHovered ? 5 : isFocused ? 4 : 3);
          const [gr, gg, gb] = hexToRgb(col.glow);
          const glow = ctx.createRadialGradient(node.x, node.y, finalR * 0.5, node.x, node.y, glowR);
          glow.addColorStop(0, `rgba(${gr},${gg},${gb},${isHovered ? 0.3 : 0.15})`);
          glow.addColorStop(0.5, `rgba(${gr},${gg},${gb},0.05)`);
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node body
        const [nr, ng, nb] = hexToRgb(col.fill);
        const nodeAlpha = isDimmed ? 0.15 : 1;

        // Inner gradient
        const grad = ctx.createRadialGradient(
          node.x - finalR * 0.3, node.y - finalR * 0.3, 0,
          node.x, node.y, finalR,
        );
        grad.addColorStop(0, `rgba(${Math.min(255, nr + 60)},${Math.min(255, ng + 60)},${Math.min(255, nb + 60)},${nodeAlpha})`);
        grad.addColorStop(1, `rgba(${nr},${ng},${nb},${nodeAlpha})`);

        ctx.beginPath();
        ctx.arc(node.x, node.y, finalR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Ring for focused
        if (isFocused) {
          ctx.strokeStyle = `rgba(255,255,255,0.8)`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.4)`;
          ctx.lineWidth = 4;
          const ringR = finalR + 4 + Math.sin(t * 3) * 1.5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Label
        const isSmallNode = node.nodeType === 'tag' || node.nodeType === 'unresolved';
        const showLabel = isHovered || isFocused || isNeighbor || isHoverNeighbor ||
          (!compact && !isDimmed && !isSmallNode && tr.k > 0.6) ||
          (!compact && !isDimmed && isSmallNode && tr.k > 1.2) ||
          (compact && (isHovered || isFocused));

        if (showLabel) {
          const fontSize = isSmallNode
            ? (compact ? 7 : (isHovered ? 10 : 8))
            : (compact ? 9 : (isFocused || isHovered ? 12 : 10));
          const weight = (isFocused || isHovered) ? '600' : '400';
          ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          const labelY = node.y + finalR + 5;
          const text = node.title;
          const metrics = ctx.measureText(text);

          // Label background
          if (!isDimmed) {
            const pad = 3;
            ctx.fillStyle = 'rgba(19, 20, 31, 0.75)';
            const bx = node.x - metrics.width / 2 - pad;
            const by = labelY - 1;
            const bw = metrics.width + pad * 2;
            const bh = fontSize + pad * 2;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 3);
            ctx.fill();
          }

          const textAlpha = isDimmed ? 0.15 : (isHovered || isFocused ? 1 : 0.85);
          ctx.fillStyle = `rgba(226, 232, 240, ${textAlpha})`;
          ctx.fillText(text, node.x, labelY + 2);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [focusedPage, focusedNeighbors, neighborEdges, compact, nodeRadius]);

  /* ── Interaction ────────────────────────────────── */

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { wx: 0, wy: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const { w, h } = dimensionsRef.current;
    const tr = transformRef.current;
    return {
      wx: (sx - w / 2 - tr.x) / tr.k,
      wy: (sy - h / 2 - tr.y) / tr.k,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number): GraphNode | null => {
    const arr = nodesRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      const n = arr[i];
      if (n.x == null || n.y == null) continue;
      const dx = wx - n.x;
      const dy = wy - n.y;
      const hitR = nodeRadius(n) + 6;
      if (dx * dx + dy * dy < hitR * hitR) return n;
    }
    return null;
  }, [nodeRadius]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    if (draggingRef.current) {
      draggingRef.current.fx = wx;
      draggingRef.current.fy = wy;
      simRef.current?.alpha(0.15).restart();
      return;
    }
    const node = findNodeAt(wx, wy);
    setHoveredNode(node);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = node ? 'pointer' : 'grab';
  }, [screenToWorld, findNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const node = findNodeAt(wx, wy);

    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      setDragging(node);
    } else {
      const startX = e.clientX;
      const startY = e.clientY;
      const startTx = transformRef.current.x;
      const startTy = transformRef.current.y;

      const onMove = (ev: MouseEvent) => {
        setTransform({
          ...transformRef.current,
          x: startTx + (ev.clientX - startX),
          y: startTy + (ev.clientY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
  }, [screenToWorld, findNodeAt]);

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) {
      draggingRef.current.fx = null;
      draggingRef.current.fy = null;
      setDragging(null);
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const { wx, wy } = screenToWorld(e.clientX, e.clientY);
    const node = findNodeAt(wx, wy);
    if (node) onPageClick(node.id);
  }, [screenToWorld, findNodeAt, onPageClick]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { w, h } = dimensionsRef.current;
    const tr = transformRef.current;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newK = Math.max(0.1, Math.min(6, tr.k * factor));
    const ratio = newK / tr.k;

    setTransform({
      x: mx - w / 2 - (mx - w / 2 - tr.x) * ratio,
      y: my - h / 2 - (my - h / 2 - tr.y) * ratio,
      k: newK,
    });
  }, []);

  /* ── Legend ─────────────────────────────────────── */

  const legend = useMemo(() => {
    if (!graphData) return [];
    const cats = new Set(graphData.nodes.map((n) => n.category));
    return Array.from(cats).map((c) => ({ category: c, color: getColor(c).fill }));
  }, [graphData]);

  const isEmpty = !graphData || graphData.nodes.length === 0;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ background: '#13141f' }}>
      {isEmpty ? (
        <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
          위키 페이지가 없어 그래프를 표시할 수 없습니다
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
            onWheel={handleWheel}
            style={{ display: 'block', width: dimensions.w, height: dimensions.h }}
          />

          {/* Tooltip */}
          {hoveredNode && !dragging && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: Math.min(
                  dimensions.w - 200,
                  Math.max(10, dimensions.w / 2 + transform.x + hoveredNode.x * transform.k + 20),
                ),
                top: Math.max(10, dimensions.h / 2 + transform.y + hoveredNode.y * transform.k - 20),
              }}
            >
              <div className="rounded-xl bg-[#1e1f2e]/95 border border-[#2d2e42] px-4 py-3 shadow-2xl backdrop-blur-md min-w-[140px]">
                <div className="text-[13px] font-semibold text-white leading-tight">{hoveredNode.title}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getColor(hoveredNode.category).fill }} />
                  <span className="text-[10px] text-[#94a3b8] capitalize">{hoveredNode.category}</span>
                </div>
                <div className="text-[10px] text-[#64748b] mt-1">
                  {hoveredNode.linkCount} connection{hoveredNode.linkCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          {!compact && legend.length > 0 && (
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 bg-[#13141f]/80 backdrop-blur-md rounded-xl px-4 py-2.5 border border-[#2d2e42]">
              {legend.map((l) => (
                <div key={l.category} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-[#94a3b8] capitalize font-medium">{l.category}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          {!compact && (
            <div className="absolute top-3 right-3 text-[10px] text-[#64748b] bg-[#13141f]/80 backdrop-blur-md rounded-xl px-4 py-2 border border-[#2d2e42] font-medium">
              {graphData.nodes.length} pages · {graphData.edges.length} links
            </div>
          )}
        </>
      )}
    </div>
  );
}
