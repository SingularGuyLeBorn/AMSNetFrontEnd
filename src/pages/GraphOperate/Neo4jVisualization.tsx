import React, { useRef, useEffect, useState } from 'react';
import { Card, Descriptions, Image, Typography } from 'antd';
// 导入 vis-network 的核心库和样式文件
// standalone/esm/vis-network 包含了所有模块，方便使用
import { Network, DataSet } from 'vis-network/standalone/esm/vis-network';
import 'vis-network/styles/vis-network.css';

const { Title } = Typography;

// 辅助组件：用于截断长文本并提供悬浮提示，以优化UI显示
const TruncatedText: React.FC<{ text: any; maxWidth?: number }> = ({ text, maxWidth = 280 }) => {
  // 确保所有传入的 text 都被转换为字符串
  const stringText = String(text);
  return (
    <span
      title={stringText} // 鼠标悬浮时，在原生 tooltip 中完整显示文本
      style={{
        display: 'inline-block',
        maxWidth: maxWidth,
        whiteSpace: 'nowrap',    // 防止文本换行
        overflow: 'hidden',      // 隐藏超出部分
        textOverflow: 'ellipsis',// 超出部分显示省略号
        verticalAlign: 'bottom', // 保证与其他内联元素对齐
      }}
    >
      {stringText}
    </span>
  );
};


// 定义节点的接口，规范节点数据结构
interface Node {
  name: string; // 节点的唯一标识符和显示名称
  properties: { [key: string]: any }; // 节点的属性，一个键值对集合
}

// 定义关系的接口，规范关系数据结构
interface Relationship {
  name: string; // 关系的类型名称
  properties: { [key: string]: any }; // 关系的属性，通常包含 fromNode 和 toNode
}

// 定义组件的属性接口
interface Neo4jVisualizationProps {
  nodes?: Node[]; // 节点数组，可选
  relationships?: Relationship[]; // 关系数组，可选
}

const Neo4jVisualization: React.FC<Neo4jVisualizationProps> = ({ nodes = [], relationships = [] }) => {
  // 创建一个 ref 来引用图表容器的 DOM 元素
  const cardRef = useRef<HTMLDivElement>(null);
  // 创建一个 ref 来持有 vis-network 的实例，以便在组件的生命周期内访问它
  const networkRef = useRef<Network | null>(null);
  // 使用 state 来存储当前被选中的节点信息
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  // 使用 state 来存储当前被选中的关系（边）信息
  const [selectedLink, setSelectedLink] = useState<Relationship | null>(null);

  // 【核心优化】将传入的`nodes`和`relationships`数据序列化为JSON字符串。
  // 这么做的目的是为了给`useEffect`一个稳定可靠的依赖项。
  // 如果直接使用 `[nodes, relationships]` 作为依赖，父组件的任何重渲染都可能导致 `nodes` 和 `relationships` 的引用地址发生变化（即使内容完全相同），
  // 这会触发`useEffect`不必要地重新执行，导致图表频繁且昂贵的重绘。
  // 通过`JSON.stringify`，我们得到一个原始的字符串值，只有当数据内容真正改变时，这个字符串才会改变，从而精确控制图表的更新。
  const dataSignature = JSON.stringify({ nodes, relationships });

  useEffect(() => {
    // 定义不作为独立属性节点展示的属性名，例如图片这种特殊处理的属性
    const excludedProperties = ['annotatedImage', 'ImgName'];

    if (cardRef.current) {
      const container = cardRef.current;

      // =================================================================
      // 数据转换逻辑：
      // 为了实现“实体节点-属性-实体节点”的可视化模式，我们需要对原始数据进行处理。
      // 这里的核心思想是：将节点的每个“属性”也变成一个可视化的“属性节点”。
      // 例如，一个名为 "Alice" 的节点，有属性 { city: "New York" }，
      // 我们会创建一个新的、形状为方块的“属性节点”，标签为 "New York"，
      // 然后在 "Alice" 和 "New York" 之间创建一条边，表示从属关系。
      // 这使得具有相同属性值的节点可以被清晰地组织在一起。
      // =================================================================

      // 用于收集所有具有相同'属性键:属性值'的节点
      const propertyToNodesMap: { [key: string]: Node[] } = {};
      // 存储新创建的“属性节点”
      const newNodes: Node[] = [];
      // 存储从原始节点指向新“属性节点”的关系
      const newRelationships: Relationship[] = [];

      // 第一步：遍历所有原始节点，构建 propertyToNodesMap
      nodes.forEach(node => {
        Object.entries(node.properties).forEach(([key, value]) => {
          // 排除掉指定的属性和空值属性
          if (excludedProperties.includes(key) || value === null || value === undefined) {
            return;
          }
          const propertyValue = `${key}:${value}`; // 创建一个唯一的属性标识符
          if (!propertyToNodesMap[propertyValue]) {
            propertyToNodesMap[propertyValue] = [];
          }
          propertyToNodesMap[propertyValue].push(node);
        });
      });

      // 第二步：根据 propertyToNodesMap 创建新的“属性节点”和它们与原始节点的关系
      Object.entries(propertyToNodesMap).forEach(([propertyValue, currentNodes]) => {
        const [key, value] = propertyValue.split(':');
        const newNode: Node = {
          name: propertyValue, // "属性节点"的内部名称，如 "city:New York"
          properties: { belongTo: key }, // "属性节点"的属性，表明它属于哪一类属性（如 "city"）
        };

        // 避免重复创建相同的属性节点
        const existingNode = newNodes.find(n => n.name === newNode.name && n.properties.belongTo === newNode.properties.belongTo);
        if (!existingNode) {
          newNodes.push(newNode);
        }

        // 为每个共享此属性的原始节点，创建一个指向新“属性节点”的关系
        currentNodes.forEach(node => {
          const newRelationship: Relationship = {
            name: key, // 关系名称就是属性的键
            properties: {
              fromNode: node.name,
              toNode: newNode.name,
            },
          };
          newRelationships.push(newRelationship);
        });
      });

      // 定义两种节点的颜色方案，以作区分
      const primaryNodeColor = { // 主要实体节点的颜色
        background: '#EBF5FB',
        border: '#85C1E9',
        highlight: { background: '#D6EAF8', border: '#3498DB' },
      };
      const propertyNodeColor = { // "属性节点"的颜色
        background: '#E8F8F5',
        border: '#7DCEA0',
        highlight: { background: '#D4EFDF', border: '#2ECC71' },
      };

      // 使用 vis-network 的 DataSet 来管理节点数据，这样可以方便地进行增删改查
      const visNodes = new DataSet([
        // 添加原始的实体节点
        ...nodes.map(node => ({
          id: node.name,
          label: node.name, // 节点上显示的文本
          ...node.properties, // 将原始属性附加到vis节点对象上，方便点击时获取
          shape: 'ellipse', // 实体节点形状为椭圆
          color: primaryNodeColor,
          margin: 10,
          font: { size: 16, color: '#34495E', face: 'Arial, sans-serif' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5, x: 2, y: 2 },
        })),
        // 添加新创建的“属性节点”
        ...newNodes.map(node => ({
          id: `${node.name}-${node.properties.belongTo}`, // 为属性节点创建唯一ID，防止与主节点或其他属性节点冲突
          label: node.name.split(':')[1], // 属性节点的标签只显示属性值
          ...node.properties,
          shape: 'box', // 属性节点形状为方块
          color: propertyNodeColor,
          margin: 10,
          font: { size: 14, color: '#34495E', face: 'Arial, sans-serif' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5, x: 2, y: 2 },
        })),
      ]);

      let edgeIdCounter = 0; // 用于为边生成唯一ID
      // 使用 vis-network 的 DataSet 来管理边数据
      const visEdges = new DataSet([
        // 添加原始关系
        ...relationships.map(rel => {
          const sourceNode = nodes.find(node => node.name === rel.properties.fromNode);
          const targetNode = nodes.find(node => node.name === rel.properties.toNode);
          if (sourceNode && targetNode) {
            return {
              id: `edge-${edgeIdCounter++}`,
              from: sourceNode.name,
              to: targetNode.name,
              label: rel.name,
              ...rel.properties, // 附加原始属性
            };
          }
          return null;
        }).filter(Boolean) as { id: string; from: string; to: string; label: string }[],
        // 添加连接原始节点和“属性节点”的新关系
        ...newRelationships.map(rel => {
          const sourceNode = nodes.find(node => node.name === rel.properties.fromNode);
          const targetNode = newNodes.find(node => node.name === rel.properties.toNode);
          if (sourceNode && targetNode) {
            return {
              id: `edge-${edgeIdCounter++}`,
              from: sourceNode.name,
              to: `${targetNode.name}-${targetNode.properties.belongTo}`, // 目标是属性节点的唯一ID
              label: rel.name,
              ...rel.properties,
            };
          }
          return null;
        }).filter(Boolean) as { id: string; from: string; to: string; label: string }[],
      ]);

      const data = { nodes: visNodes, edges: visEdges };

      // vis-network 的配置选项
      const options = {
        interaction: {
          hover: true, // 启用悬停效果
          tooltipDelay: 200, // 悬停提示延迟
          dragNodes: true, // 允许拖动节点
          dragView: true, // 允许拖动视图
        },
        physics: {
          enabled: true, // 启用物理引擎
          // 配置物理引擎，使用 barnesHut 算法可以高效地模拟节点间的引力和斥力，防止节点重叠
          barnesHut: {
            gravitationalConstant: -1000,
            centralGravity: 0.01,
            springLength: 250,
            springConstant: 0.05,
            damping: 0.1,
            avoidOverlap: 0.8,
          },
          solver: 'barnesHut',
          stabilization: { iterations: 2000 }, // 稳定化迭代次数
        },
        nodes: { borderWidth: 2, size: 30 },
        edges: {
          arrows: { to: { enabled: true, scaleFactor: 0.7 } }, // 箭头配置
          color: { color: '#BDC3C7', highlight: '#85C1E9', hover: '#85C1E9' },
          font: { align: 'middle', size: 12, color: '#7F8C8D' },
          // 边使用平滑曲线，'cubicBezier' 提供了较好的视觉效果
          smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 },
        },
      };

      // 创建 vis-network 实例
      const network = new Network(container, data, options);
      networkRef.current = network;

      // 监听 'stabilized' 事件，当物理引擎计算稳定后，关闭它以提高性能，避免不必要的CPU消耗
      network.once('stabilized', () => {
        network.setOptions({ physics: false });
      });

      // 注册点击事件监听器，这是组件交互的核心
      network.on('click', (params) => {
        if (params.nodes.length > 0) {
          // 如果点击的是节点
          const nodeId = params.nodes[0];
          // 在原始节点和新创建的属性节点中查找被点击的节点
          const node = nodes.find(n => n.name === nodeId) || newNodes.find(n => `${n.name}-${n.properties.belongTo}` === nodeId);
          if (node) {
            setSelectedNode(node); // 更新React state，触发右侧详情面板的渲染
            setSelectedLink(null);
          }
        } else if (params.edges.length > 0) {
          // 如果点击的是边
          const edgeId = params.edges[0];
          const edgeData = visEdges.get(edgeId); // 从DataSet中获取边的完整数据
          if (edgeData) {
            // 在原始关系和新创建的关系中查找对应的关系数据
            const edge = relationships.find(r => r.name === edgeData.label && r.properties.fromNode === edgeData.from && r.properties.toNode === edgeData.to) ||
              newRelationships.find(r => r.name === edgeData.label && r.properties.fromNode === edgeData.from);
            if (edge) {
              setSelectedLink(edge); // 更新React state
              setSelectedNode(null);
            }
          }
        } else {
          // 如果点击的是画布空白处
          setSelectedNode(null);
          setSelectedLink(null);
        }
      });

      // 【重要】返回一个清理函数。
      // 在React组件卸载时（或useEffect下次执行前），这个函数会被调用。
      // `network.destroy()` 会清理vis-network创建的所有DOM元素和事件监听器，释放资源，防止内存泄漏。
      return () => {
        if (networkRef.current) {
          networkRef.current.destroy();
          networkRef.current = null;
        }
      };
    }
    // 【核心修改】使用 dataSignature 作为唯一的依赖项，确保只有在数据内容实际变化时才重建图表
  }, [dataSignature]);

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', overflow: 'hidden', background: '#F8F9F9' }}>
      {/* 左侧图表容器，ref 指向此 div，vis-network 将在此处渲染 */}
      <Card ref={cardRef} style={{ flexGrow: 1, height: '100%', border: 'none', background: 'transparent' }} bodyStyle={{ padding: 0, height: '100%', width: '100%' }} />

      {/* 右侧详情显示面板 */}
      <Card style={{ width: 450, minWidth: 400, height: '100%', overflowY: 'auto', border: 'none', borderLeft: '1px solid #EAECEE' }}>
        {/* 条件渲染：当有节点被选中时，显示节点详细信息 */}
        {selectedNode && (
          <>
            <Title level={4} style={{ padding: '16px 24px 0' }}>节点详情</Title>
            <Descriptions bordered column={1} style={{ margin: '0 24px 24px' }} size="small">
              <Descriptions.Item label="名称">
                <TruncatedText text={selectedNode.name} />
              </Descriptions.Item>
              {/* 遍历并显示节点的所有属性 */}
              {Object.entries(selectedNode.properties).map(([key, value]) => {
                // 对图片属性进行特殊处理，直接显示图片
                if (key === 'annotatedImage' && value) {
                  return (
                    <Descriptions.Item key={key} label="标注图片">
                      <Image src={value} width={100} />
                    </Descriptions.Item>
                  );
                }
                // 过滤掉不希望在详情中显示的属性
                if (key !== 'annotatedImage' && key !== 'ImgName') {
                  return (
                    <Descriptions.Item key={key} label={key}>
                      <TruncatedText text={value} />
                    </Descriptions.Item>
                  );
                }
                return null;
              })}
            </Descriptions>
          </>
        )}
        {/* 条件渲染：当有关系被选中时，显示关系详细信息 */}
        {selectedLink && (
          <>
            <Title level={4} style={{ padding: '16px 24px 0' }}>关系详情</Title>
            <Descriptions bordered column={1} style={{ margin: '0 24px 24px' }} size="small">
              <Descriptions.Item label="类型">
                <TruncatedText text={selectedLink.name} />
              </Descriptions.Item>
              {Object.entries(selectedLink.properties).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  <TruncatedText text={value} />
                </Descriptions.Item>
              ))}
            </Descriptions>
          </>
        )}
        {/* 条件渲染：当没有元素被选中时，显示占位提示信息 */}
        {!selectedNode && !selectedLink && (
          <div style={{ textAlign: 'center', color: '#999', paddingTop: '45%', paddingLeft: 20, paddingRight: 20 }}>
            <Title level={5} style={{ color: '#B2BABB' }}>
              请选择一个节点或关系
            </Title>
            <p>点击图中的元素以在此处查看其详细信息。</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Neo4jVisualization;
