// FILE: src/pages/GraphOperate/GraphVisualization.tsx

import React, { useEffect, useRef } from 'react';
import G6, { Graph, IGroup, IShape } from '@antv/g6';
import { GraphData, Node, Relationship } from './index';

// ===================================================================
// 基石协议: 严格类型定义 (Bedrock Protocol: Strict Type Definitions)
// -------------------------------------------------------------------
// 此处定义了组件内部使用的数据模型, 确保从数据转换到G6渲染的
// 整个链路上的类型纯度, 根除任何类型不匹配的可能。
// ===================================================================

/**
 * G6 节点模型。我们扩展了 G6 的 NodeConfig，
 * 强制包含了我们业务模型中的'name'和'properties'字段。
 * 这是确保在 Tooltip 或其他交互中安全访问数据的基石。
 */
type BedrockNodeModel = G6.NodeConfig & Node;

/**
 * G6 边模型。同样，扩展了 G6 的 EdgeConfig，
 * 包含了我们业务模型中的'name'和'properties'字段。
 */
type BedrockEdgeModel = G6.EdgeConfig & Relationship;

interface GraphVisualizationProps {
  data: GraphData;
}

// ===================================================================
// 基石协议: 视觉与交互配置 (Bedrock Protocol: Visual & Interaction Config)
// -------------------------------------------------------------------
// 将所有G6的配置项抽离为独立的、有明确注释的常量。
// 这遵循了“意图至上”原则，每一项配置都有其存在的理由。
// ===================================================================

const NODE_TYPE_COLOR_MAP: Record<string, string> = {
  Project: '#5B8FF9',
  Developer: '#61DDAA',
  Module: '#65789B',
  Technology: '#F6BD16',
  Company: '#E86452',
  Customer: '#9254DE',
  Product: '#73D13D',
  Service: '#FF9D4D',
  Language: '#A372E3',
  Default: '#C2C8D5',
};

/**
 * 创建一个内容丰富的、格式化的 Tooltip HTML 字符串。
 * @param model - 从 G6 事件中获取的节点或边的数据模型。
 * @returns 用于 Tooltip 展示的 HTML 字符串。
 */
const getTooltipContent = (model: BedrockNodeModel | BedrockEdgeModel): string => {
  const { name, properties } = model;
  let content = `<div class="g6-tooltip-title">${name}</div>`;
  content += '<div class="g6-tooltip-body">';

  // 过滤掉用于建立连接的 fromNode 和 toNode 属性，因为它们在图上已是可视化信息
  const filteredProperties = Object.entries(properties).filter(
    ([key]) => key !== 'fromNode' && key !== 'toNode',
  );

  if (filteredProperties.length === 0) {
    content += '<div class="g6-tooltip-item">No additional properties</div>';
  } else {
    for (const [key, value] of filteredProperties) {
      content += `
        <div class="g6-tooltip-item">
          <span class="g6-tooltip-key">${key}:</span>
          <span class="g6-tooltip-value">${String(value)}</span>
        </div>
      `;
    }
  }
  content += '</div>';
  return content;
};

/**
 * 集中管理的 G6 Graph 实例配置对象。
 */
const getGraphConfig = (container: HTMLDivElement): G6.GraphOptions => ({
  container,
  width: container.scrollWidth,
  height: container.scrollHeight,
  plugins: [
    new G6.Tooltip({
      offsetX: 10,
      offsetY: 10,
      itemTypes: ['node', 'edge'],
      // 关键修正：确保从事件中获取的模型被正确断言为我们定义的严格类型
      getContent: (e) => {
        if (!e || !e.item) return '';
        const model = e.item.getModel() as BedrockNodeModel | BedrockEdgeModel;
        return getTooltipContent(model);
      },
      className: 'g6-component-tooltip',
    }),
  ],
  layout: {
    type: 'forceAtlas2',
    preventOverlap: true,
    kr: 30, // Repelling strength
    workerEnabled: true, // Use web-worker for layout calculation
  },
  modes: {
    default: ['drag-canvas', 'zoom-canvas', 'drag-node', 'click-select'],
  },
  defaultNode: {
    size: 40,
    style: {
      lineWidth: 2,
      stroke: '#fff',
    },
    labelCfg: {
      style: {
        fill: '#333',
        fontSize: 10,
      },
      position: 'bottom',
    },
  },
  defaultEdge: {
    style: {
      stroke: '#ccc',
      lineWidth: 1.5,
      endArrow: {
        path: G6.Arrow.triangle(8, 10, 2),
        d: 2,
        fill: '#ccc',
      },
    },
    labelCfg: {
      autoRotate: true,
      refY: -10,
      style: {
        fill: '#666',
        fontSize: 10,
        background: {
          fill: '#ffffff',
          stroke: '#ffffff',
          padding: [2, 2, 2, 2],
          radius: 2,
        },
      },
    },
  },
  // 交互状态样式
  nodeStateStyles: {
    hover: {
      lineWidth: 4,
      stroke: '#1890ff',
    },
    select: {
      lineWidth: 4,
      stroke: '#1890ff',
    },
  },
  edgeStateStyles: {
    hover: {
      stroke: '#1890ff',
      lineWidth: 2,
    },
    select: {
      stroke: '#1890ff',
      lineWidth: 2,
    },
  },
});

// ===================================================================
// React 组件定义 (React Component Definition)
// ===================================================================

const Legend: React.FC = () => (
  <div className="g6-legend">
    <div className="g6-legend-title">Legend</div>
    {Object.entries(NODE_TYPE_COLOR_MAP).map(([type, color]) => {
      if (type === 'Default') return null;
      return (
        <div key={type} className="legend-item">
          <div className="legend-symbol" style={{ backgroundColor: color }} />
          <span>{type}</span>
        </div>
      );
    })}
  </div>
);

const GraphVisualization: React.FC<GraphVisualizationProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  useEffect(() => {
    // 确保容器DOM已挂载
    if (!containerRef.current) {
      return;
    }

    // 关键修正: 销毁旧的图表实例, 防止内存泄漏和React严格模式下的重复渲染问题
    if (graphRef.current) {
      graphRef.current.destroy();
    }

    // 1. 数据转换: 将业务数据 (`GraphData`) 严格转换为 G6 需要的格式。
    //    这是类型安全的关键步骤。
    const transformedNodes: BedrockNodeModel[] = data.nodes.map((node) => ({
      ...node,
      // G6 'label' 字段用于显示文本, 如果名称过长则截断
      label: node.name.length > 20 ? `${node.name.substring(0, 18)}...` : node.name,
      // 根据节点类型设置样式
      style: {
        ...getGraphConfig(containerRef.current!).defaultNode?.style,
        fill: NODE_TYPE_COLOR_MAP[node.properties.type] || NODE_TYPE_COLOR_MAP.Default,
      },
    }));

    const transformedEdges: BedrockEdgeModel[] = data.relationships.map((rel) => ({
      ...rel,
      // G6 的边必须有 'source' 和 'target' 字段, 其值为节点的 'id'
      source: rel.properties.fromNode,
      target: rel.properties.toNode,
      // G6 'label' 字段用于显示文本
      label: rel.name,
    }));

    // 2. 实例化 G6: 使用清晰、模块化的配置
    const graph = new G6.Graph(getGraphConfig(containerRef.current));
    graphRef.current = graph;

    // 3. 加载数据并渲染
    graph.data({
      nodes: transformedNodes,
      edges: transformedEdges,
    });
    graph.render();

    // 4. 响应式布局: 监听窗口大小变化, 自动调整画布尺寸
    const handleResize = () => {
      if (graphRef.current && !graphRef.current.get('destroyed') && containerRef.current) {
        graphRef.current.changeSize(containerRef.current.scrollWidth, containerRef.current.scrollHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    // 5. 清理副作用: 在组件卸载时, 必须销毁图表实例并移除事件监听器。
    //    这是防止内存泄漏和确保应用稳定性的关键。
    return () => {
      window.removeEventListener('resize', handleResize);
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [data]); // 仅当 `data` prop 发生变化时, 才重新执行此 effect

  return (
    <div className="graph-visualization-container">
      <div id="g6-container" ref={containerRef} />
      <Legend />
    </div>
  );
};

export default GraphVisualization;

// END OF FILE: src/pages/GraphOperate/GraphVisualization.tsx
