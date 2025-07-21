import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

// Type definitions
interface NodeData {
  id: string;
  level: 's' | 'p' | 'm';
  size?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface LinkData {
  source: string | NodeData;
  target: string | NodeData;
  value?: number;
}

interface GraphData {
  nodes: NodeData[];
  links: LinkData[];
}

interface RawData {
  name: string;
  parent: string | null;
  level: 's' | 'p' | 'm';
}

interface LegendItem {
  color: string;
  label: string;
}

@Component({
  selector: 'app-network-graph',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './network-graph.html',
  styleUrl: './network-graph.css'
})
export class NetworkGraphComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('legend', { static: true }) legendRef!: ElementRef<HTMLDivElement>;

  // Configuration
  private readonly FILE = 'http://localhost:8000/data.json';
  private isMacro = false;
  private macroGraph!: GraphData;
  private microGraph!: GraphData;

  // D3 selections
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private linkG!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private nodeG!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private labelG!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    this.initializeD3();
    this.loadData();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private initializeD3(): void {
  // D3 selections
  this.svg = d3.select(this.svgRef.nativeElement);
  this.g = this.svg.append("g"); // zoom container
  this.linkG = this.g.append("g");
  this.nodeG = this.g.append("g");
  this.labelG = this.g.append("g");

  // Zoom setup
  this.zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      this.g.attr("transform", event.transform.toString());
    });

  const rect = this.svgRef.nativeElement.getBoundingClientRect();
  this.svg.call(this.zoom)
    .call(this.zoom.transform, d3.zoomIdentity.translate(rect.width / 2, rect.height / 2));
}

private loadData(): void {

  /* 1️⃣  Let HttpClient parse the JSON for us.
        -> remove `responseType: 'text'`
        -> give HttpClient a generic so rows: RawData[] */
  this.http.get<RawData[]>(this.FILE).subscribe({

    /* 2️⃣  rows is already an array of objects — no split / JSON.parse */
    next: (rows: RawData[]) => {

      const nodesById = new Map<string, NodeData>();
      const edges: LinkData[] = [];

      rows.forEach(({ parent, name, level }: RawData) => {
        /* build / dedup nodes */
        if (!nodesById.has(name)) {
          nodesById.set(name, { id: name, level });
        }

        /* build edges + implicit parent nodes */
        if (parent !== null) {
          if (!nodesById.has(parent)) {
            const parentLevel = this.inferParentLevel(level);
            nodesById.set(parent, { id: parent, level: parentLevel });
          }
          edges.push({ source: parent, target: name });
        }
      });

      /* 3️⃣  same post‑processing as before */
      this.microGraph = { nodes: [...nodesById.values()], links: edges };
      this.macroGraph = this.buildMacroGraph(this.microGraph);

      this.initLegend();
      this.draw(this.microGraph);
    },

    error: (err) => console.error('Error loading data:', err)
  });}

  private inferParentLevel(childLevel: 's' | 'p' | 'm'): 's' | 'p' | 'm' {
  switch (childLevel) {
    case 'm': return 'p';
    case 'p': return 's';
    case 's': return 's';
    default: return 's';
  }
}

  private buildMacroGraph({ nodes, links }: GraphData): GraphData {
  const roots = nodes.filter((n: NodeData) => n.level === 's');
  const rootIdx = new Map(roots.map((r: NodeData) => [r.id, r]));

  const childrenByRoot = new Map<string, Set<string>>(roots.map((r: NodeData) => [r.id, new Set()]));

  links.forEach((l: LinkData) => {
    const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
    const targetId = typeof l.target === 'string' ? l.target : l.target.id;
    const targetNode = nodes.find(n => n.id === targetId);

    if (rootIdx.has(sourceId) && targetNode && (targetNode.level === 'p' || targetNode.level === 'm')) {
      childrenByRoot.get(sourceId)?.add(targetId);
    }
  });

  const macroLinks: LinkData[] = [];
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const a = roots[i].id;
      const b = roots[j].id;
      const setA = childrenByRoot.get(a);
      const setB = childrenByRoot.get(b);

      if (setA && setB) {
        const inter = this.intersection(setA, setB).size;
        if (inter > 0) {
          macroLinks.push({ source: a, target: b, value: inter });
        }
      }
    }
  }

  roots.forEach((r: NodeData) => {
    r.size = childrenByRoot.get(r.id)?.size || 0;
  });

  return { nodes: roots, links: macroLinks };
}

  private intersection(a: Set<string>, b: Set<string>): { size: number } {
  let n = 0;
  for (const x of a) {
    if (b.has(x)) n++;
  }
  return { size: n };
}

  private calculatePositions(nodes: NodeData[], links: LinkData[]): void {
  const rect = this.svgRef.nativeElement.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  if(this.isMacro) {
  // Circular layout for macro view
  const radius = Math.min(centerX, centerY) * 0.6;
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    node.x = centerX + radius * Math.cos(angle);
    node.y = centerY + radius * Math.sin(angle);
  });
} else {
  // Hierarchical layout for micro view
  this.calculateHierarchicalLayout(nodes, links, centerX, centerY);
}
  }

  private calculateHierarchicalLayout(nodes: NodeData[], _links: LinkData[], centerX: number, centerY: number): void {
  // Group nodes by level
  const nodesByLevel = new Map<string, NodeData[]>();
  nodes.forEach(node => {
    if (!nodesByLevel.has(node.level)) {
      nodesByLevel.set(node.level, []);
    }
    nodesByLevel.get(node.level)!.push(node);
  });

  // Position nodes by level
  const levelOrder = ['s', 'p', 'm'];
  const levelHeight = 150;
  const startY = centerY - (levelOrder.length - 1) * levelHeight / 2;

  levelOrder.forEach((level, levelIndex) => {
    const nodesAtLevel = nodesByLevel.get(level) || [];
    const levelWidth = Math.max(400, nodesAtLevel.length * 100);
    const startX = centerX - levelWidth / 2;

    nodesAtLevel.forEach((node, nodeIndex) => {
      node.x = startX + (levelWidth * nodeIndex) / Math.max(1, nodesAtLevel.length - 1);
      node.y = startY + levelIndex * levelHeight;
    });
  });
}

  private getNodeById(nodes: NodeData[], id: string): NodeData | undefined {
  return nodes.find(node => node.id === id);
}

  private draw({ nodes, links }: GraphData): void {
  // Calculate positions using a simple layout algorithm
  this.calculatePositions(nodes, links);

  // Links
  const linkSel = this.linkG.selectAll<SVGLineElement, LinkData>("line")
    .data(links, (d: LinkData) => {
      const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
      const targetId = typeof d.target === 'string' ? d.target : d.target.id;
      return `${sourceId}->${targetId}`;
    });

  linkSel.exit().remove();

  const linkEnter = linkSel.enter().append("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", (d: LinkData) => this.isMacro ? Math.sqrt(d.value || 1) : 1);

  linkEnter.merge(linkSel)
    .attr("x1", (d: LinkData) => this.getNodeById(nodes, typeof d.source === 'string' ? d.source : d.source.id)?.x || 0)
    .attr("y1", (d: LinkData) => this.getNodeById(nodes, typeof d.source === 'string' ? d.source : d.source.id)?.y || 0)
    .attr("x2", (d: LinkData) => this.getNodeById(nodes, typeof d.target === 'string' ? d.target : d.target.id)?.x || 0)
    .attr("y2", (d: LinkData) => this.getNodeById(nodes, typeof d.target === 'string' ? d.target : d.target.id)?.y || 0);

  // Nodes
  const nodeSel = this.nodeG.selectAll<SVGCircleElement, NodeData>("circle")
    .data(nodes, (d: NodeData) => d.id);

  nodeSel.exit().remove();

  const nodeEnter = nodeSel.enter().append("circle")
    .attr("r", (d: NodeData) => this.isMacro ? 6 + (d.size || 0) : 4)
    .attr("fill", (d: NodeData) => this.colour(d.level))
    .on("click", (_event: MouseEvent, d: NodeData) => this.focusNode(d));

  nodeEnter.merge(nodeSel)
    .attr("cx", (d: NodeData) => d.x || 0)
    .attr("cy", (d: NodeData) => d.y || 0);

  // Labels
  const labelSel = this.labelG.selectAll<SVGTextElement, NodeData>("text")
    .data(nodes, (d: NodeData) => d.id);

  labelSel.exit().remove();

  const labelEnter = labelSel.enter().append("text")
    .attr("class", "label")
    .text((d: NodeData) => d.id);

  labelEnter.merge(labelSel)
    .attr("x", (d: NodeData) => (d.x || 0) + 6)
    .attr("y", (d: NodeData) => (d.y || 0) + 3);
}

  private colour(level: 's' | 'p' | 'm'): string {
  switch (level) {
    case 's': return "#f97316"; // orange - senior
    case 'p': return "#3b82f6"; // blue - parent
    case 'm': return "#16a34a"; // green - middle
    default: return "#6b7280"; // gray fallback
  }
}

  private focusNode(node: NodeData): void {
  // Check if this node is already focused
  const currentFocused = this.nodeG.select("circle.focused").datum() as NodeData;
  if(currentFocused && currentFocused.id === node.id) {
  this.clearFocus();
  return;
}

this.clearFocus();
const neighbours = new Set<string>();

// Find neighbors based on the current graph
const currentGraph = this.isMacro ? this.macroGraph : this.microGraph;
currentGraph.links.forEach((l: LinkData) => {
  const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
  const targetId = typeof l.target === 'string' ? l.target : l.target.id;

  if (sourceId === node.id) {
    neighbours.add(targetId);
  } else if (targetId === node.id) {
    neighbours.add(sourceId);
  }
});

// Mark focused node
this.nodeG.selectAll<SVGCircleElement, NodeData>("circle")
  .classed("focused", (d: NodeData) => d.id === node.id)
  .classed("dimmed", (d: NodeData) => d.id !== node.id && !neighbours.has(d.id));

this.linkG.selectAll<SVGLineElement, LinkData>("line")
  .classed("dimmed", (l: LinkData) => {
    const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
    const targetId = typeof l.target === 'string' ? l.target : l.target.id;
    return sourceId !== node.id && targetId !== node.id;
  });

this.labelG.selectAll<SVGTextElement, NodeData>("text")
  .classed("dimmed", (d: NodeData) => d.id !== node.id && !neighbours.has(d.id));
  }

  private clearFocus(): void {
  this.nodeG.selectAll<SVGCircleElement, NodeData>("circle").classed("dimmed", false).classed("focused", false);
  this.linkG.selectAll<SVGLineElement, LinkData>("line").classed("dimmed", false);
  this.labelG.selectAll<SVGTextElement, NodeData>("text").classed("dimmed", false);
}

  private initLegend(): void {
  const items: LegendItem[] = [
    { color: "#f97316", label: "Senior (s)" },
    { color: "#3b82f6", label: "Parent (p)" },
    { color: "#16a34a", label: "Middle (m)" }
  ];

  d3.select(this.legendRef.nativeElement)
    .selectAll<HTMLDivElement, LegendItem>("div")
    .data(items)
    .enter()
    .append("div")
    .style("background", (d: LegendItem) => d.color)
    .text((d: LegendItem) => d.label);
}

  public toggleView(): void {
  this.isMacro = !this.isMacro;
  this.draw(this.isMacro ? this.macroGraph : this.microGraph);
}

  // Getter for template
  get viewButtonText(): string {
  return this.isMacro ? 'Micro view' : 'Macro view';
}
}
