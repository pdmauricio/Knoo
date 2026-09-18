import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const RDFGraph = ({ graphData }) => {
  const svgRef = useRef();

  useEffect(() => {
    if (!graphData || !graphData.nodes || !graphData.links) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 900;
    const height = 600;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    svg.attr("width", width).attr("height", height);

    // Create container group
    const container = svg.append("g");

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Create simulation
    const simulation = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => Math.sqrt(d.size) + 10));

    // Create arrow markers
    const defs = container.append("defs");
    
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#666");

    // Create links
    const link = container.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graphData.links)
      .enter().append("line")
      .attr("stroke", d => d.color || "#999")
      .attr("stroke-opacity", 0.8)
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead)");

    // Create link labels
    const linkLabels = container.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(graphData.links)
      .enter().append("text")
      .attr("fill", "#555")
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("text-anchor", "middle")
      .attr("dy", "-2px")
      .style("pointer-events", "none")
      .text(d => d.label);

    // Create node groups
    const nodeGroup = container.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graphData.nodes)
      .enter().append("g")
      .attr("class", "node-group")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Add circles to nodes
    nodeGroup.append("circle")
      .attr("r", d => Math.sqrt(d.size) || 10)
      .attr("fill", d => d.color || "#69b3a2")
      .attr("stroke", "#fff")
      .attr("stroke-width", 3)
      .style("cursor", "move")
      .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.2))");

    // Add labels to nodes
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("font-size", d => d.type === "profesor" ? "12px" : "10px")
      .attr("font-weight", d => d.type === "profesor" ? "bold" : "normal")
      .attr("fill", "#333")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .each(function(d) {
        const lines = d.name.split('\n');
        const text = d3.select(this);
        lines.forEach((line, i) => {
          text.append("tspan")
            .attr("x", 0)
            .attr("dy", i === 0 ? 0 : "1.2em")
            .text(line);
        });
      });

    // Add tooltips
    nodeGroup.append("title")
      .text(d => `${d.type.charAt(0).toUpperCase() + d.type.slice(1)}: ${d.name}`);

    // Update positions on tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      linkLabels
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);

      nodeGroup
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Clean up on unmount
    return () => {
      simulation.stop();
    };

  }, [graphData]);

  return (
    <div className="rdf-graph-container">
      <div className="graph-controls">
        <p>💡 Arrastra los nodos para reorganizar | Usa la rueda del mouse para zoom</p>
      </div>
      <svg ref={svgRef}></svg>
    </div>
  );
};

export default RDFGraph;