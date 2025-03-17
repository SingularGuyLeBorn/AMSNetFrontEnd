import React, { useRef, useEffect, useState } from 'react';
import { Card, Descriptions, Image } from 'antd';
import { Network, DataSet } from 'vis-network/standalone/esm/vis-network';
import 'vis-network/styles/vis-network.css';

// 定义节点的接口
interface Node {
  name: string; // 节点的名称
  properties: { [key: string]: any }; // 节点的属性
}

// 定义关系的接口
interface Relationship {
  name: string; // 关系的名称
  properties: { [key: string]: any }; // 关系的属性
}

// 定义组件的属性接口
interface Neo4jVisualizationProps {
  nodes?: Node[]; // 可选的节点数组
  relationships?: Relationship[]; // 可选的关系数组
}

const Neo4jVisualization: React.FC<Neo4jVisualizationProps> = ({ nodes = [], relationships = [] }) => {
  const cardRef = useRef<HTMLDivElement>(null); // 用于引用图表容器的 ref
  const networkRef = useRef<Network | null>(null); // 用于引用 vis-network 实例的 ref
  const [selectedNode, setSelectedNode] = useState<Node | null>(null); // 当前选中的节点
  const [selectedLink, setSelectedLink] = useState<Relationship | null>(null); // 当前选中的关系

  useEffect(() => {
    // 建立一个不作为节点延伸出去的属性名列表
    const excludedProperties = ['annotatedImage', 'ImgName']
    if (cardRef.current) {
      const container = cardRef.current; // 获取图表容器的 DOM 元素

      // 提取具有相同属性名和属性值的节点，并创建新的节点和边
      const propertyToNodesMap: { [key: string]: Node[] } = {};
      const newNodes: Node[] = [];
      const newRelationships: Relationship[] = [];

      nodes.forEach(node => {
        Object.entries(node.properties).forEach(([key, value]) => {
          if (excludedProperties.includes(key)) {
            return;
          }
          const propertyValue = `${key}:${value}`;
          if (!propertyToNodesMap[propertyValue]) {
            propertyToNodesMap[propertyValue] = [];
          }
          propertyToNodesMap[propertyValue].push(node);
        });
      });

      Object.entries(propertyToNodesMap).forEach(([propertyValue, nodes]) => {
        if (nodes.length > 1) {
          const [key, value] = propertyValue.split(':');
          const newNode: Node = {
            name: propertyValue, // 使用属性名和属性值作为新节点的名称
            properties: {
              belongTo: key
            },
          };

          // 检查新节点是否已经存在，考虑 name 和 properties.belongTo
          const existingNode = newNodes.find(n => n.name === newNode.name && n.properties.belongTo === newNode.properties.belongTo);
          if (!existingNode) {
            newNodes.push(newNode);
          }

          nodes.forEach(node => {
            const newRelationship: Relationship = {
              name: key,
              properties: {
                fromNode: node.name,
                toNode: newNode.name,
              },
            };
            newRelationships.push(newRelationship);
          });
        } else {
          // 如果没有重复的属性值，创建一个新的节点并与原始节点相连
          const [key, value] = propertyValue.split(':');
          const newNode: Node = {
            name: propertyValue, // 使用属性名和属性值作为新节点的名称
            properties: {
              belongTo: key
            },
          };

          // 检查新节点是否已经存在，考虑 name 和 properties.belongTo
          const existingNode = newNodes.find(n => n.name === newNode.name && n.properties.belongTo === newNode.properties.belongTo);
          if (!existingNode) {
            newNodes.push(newNode);
          }

          const node = nodes[0];
          const newRelationship: Relationship = {
            name: key,
            properties: {
              fromNode: node.name,
              toNode: newNode.name,
            },
          };
          newRelationships.push(newRelationship);
        }
      });

      // 将节点数据转换为 vis-network 所需的格式
      const visNodes = new DataSet([
        ...nodes.map(node => ({
          id: node.name, // 使用节点的名称作为 ID
          label: node.name, // 使用节点的名称作为标签
          ...node.properties, // 添加节点的其他属性
          shape: 'ellipse', // 节点的形状为椭圆
          // 设置颜色为淡蓝色
          color: {
            background: '#AED6F1', // 淡蓝色背景
            border: '#3498DB', // 蓝色边框
            highlight: {
              background: '#85C1E9', // 高亮淡蓝色背景
              border: '#2980B9', // 高亮蓝色边框
            },
          },
          borderWidth: 2, // 边框宽度
          font: {
            size: 14, // 字体大小
            color: '#333333', // 字体颜色
          },
        })),
        ...newNodes.map(node => ({
          id: `${node.name}-${node.properties.belongTo}`, // 使用 name 和 belongTo 组合作为 ID
          label: node.name.split(':')[1], // 使用节点的名称作为标签
          ...node.properties, // 添加节点的其他属性
          shape: 'box', // 新节点的形状为矩形
          font: {
            size: 14, // 字体大小
            color: '#333333', // 字体颜色
            align: 'middle', // 文字水平居中
            vadjust: 0, // 文字垂直居中
          },
          // 设置颜色为绿色
          color: {
            background: '#A9DFBF', // 淡绿色背景
            border: '#27AE60', // 绿色边框
            highlight: {
              background: '#7DCEA0', // 高亮淡绿色背景
              border: '#1E8449', // 高亮绿色边框
            },
          },
          borderWidth: 2, // 边框宽度
        })),
      ]);

      // 将关系数据转换为 vis-network 所需的格式
      let edgeIdCounter = 0; // 用于生成唯一边 ID 的计数器
      const visEdges = new DataSet([
        ...relationships.map(rel => {
          const sourceNode = nodes.find(node => node.name === rel.properties.fromNode); // 查找源节点
          const targetNode = nodes.find(node => node.name === rel.properties.toNode); // 查找目标节点

          // 确保 source 和 target 是有效的节点 ID
          if (sourceNode && targetNode) {
            return {
              id: `edge-${edgeIdCounter++}`, // 使用唯一的 ID
              from: sourceNode.name, // 使用源节点的名称作为 from
              to: targetNode.name, // 使用目标节点的名称作为 to
              label: rel.name, // 使用关系的名称作为标签
              ...rel.properties, // 添加关系的其他属性
            };
          } else {
            // 如果找不到对应的节点，跳过该链接
            console.warn(`Skipping relationship ${rel.name} because one or both nodes are missing.`);
            return null;
          }
        }).filter(link => link !== null) as { id: string; from: string; to: string; label: string }[],
        ...newRelationships.map(rel => {
          const sourceNode = nodes.find(node => node.name === rel.properties.fromNode); // 查找源节点
          const targetNode = newNodes.find(node => node.name === rel.properties.toNode); // 查找目标节点

          // 确保 source 和 target 是有效的节点 ID
          if (sourceNode && targetNode) {
            return {
              id: `edge-${edgeIdCounter++}`, // 使用唯一的 ID
              from: sourceNode.name, // 使用源节点的名称作为 from
              to: `${targetNode.name}-${targetNode.properties.belongTo}`, // 使用目标节点的 name 和 belongTo 组合作为 to
              label: rel.name, // 使用关系的名称作为标签
              ...rel.properties, // 添加关系的其他属性
            };
          } else {
            // 如果找不到对应的节点，跳过该链接
            console.warn(`Skipping relationship ${rel.name} because one or both nodes are missing.`);
            return null;
          }
        }).filter(link => link !== null) as { id: string; from: string; to: string; label: string }[],
      ]);

      // 配置 vis-network
      const data = {
        nodes: visNodes, // 节点数据
        edges: visEdges, // 关系数据
      };

      // 打印所有的节点和边
      console.log('Nodes:', visNodes.get());
      console.log('Edges:', visEdges.get());

      const options = {
        interaction: {
          dragNodes: true, // 允许拖动节点
          dragView: true, // 允许拖动视图
          hover: true, // 允许悬停
        },
        physics: {
          enabled: true, // 启用物理引擎
          barnesHut: {
            gravitationalConstant: -200, // 重力常数
            centralGravity: 0, // 中心重力
            springLength: 200, // 弹簧长度
            springConstant: 0.04, // 弹簧常数
            damping: 0.09, // 阻尼
            avoidOverlap: 0.5, // 避免重叠
          },
        },
        nodes: {
          shape: 'dot', // 节点形状为圆点
          size: 20, // 节点大小
          font: {
            size: 12, // 字体大小
          },
          borderWidth: 2, // 边框宽度
          color: {
            background: 'lightgreen', // 背景颜色
            border: 'green', // 边框颜色
            highlight: {
              background: 'lightblue', // 高亮背景颜色
              border: 'blue', // 高亮边框颜色
            },
          },
        },
        edges: {
          arrows: {
            to: {
              enabled: true, // 启用箭头
              scaleFactor: 1, // 箭头缩放因子
            },
          },
          color: {
            color: 'gray', // 默认颜色
            highlight: 'lightblue', // 高亮颜色
          },
          font: {
            align: 'middle', // 标签对齐方式
          },
        },
      };

      // 创建 vis-network 实例
      const network = new Network(container, data, options);
      networkRef.current = network;

      // 监听节点点击事件
      network.on('click', (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0]; // 获取点击的节点 ID
          const node = nodes.find(n => n.name === nodeId) || newNodes.find(n => `${n.name}-${n.properties.belongTo}` === nodeId); // 查找对应的节点
          if (node) {
            setSelectedNode(node); // 设置选中的节点
            setSelectedLink(null); // 清除选中的关系
          }
        } else if (params.edges.length > 0) {
          const edgeId = params.edges[0]; // 获取点击的关系 ID
          const edge = relationships.find(r => r.name === edgeId) || newRelationships.find(r => r.name === edgeId);
          if (edge) {
            setSelectedLink(edge); // 设置选中的关系
            setSelectedNode(null); // 清除选中的节点
          }
        }
      });

      return () => {
        network.destroy(); // 销毁 vis-network 实例
      };
    }
  }, [nodes, relationships]);

  // 限制属性显示的长度
  const truncateString = (str: string, maxLength: number) => {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  };

  return (
    <div style={{ height: '100%', width: 1700, display: 'flex', overflow: 'hidden' }}>
      <Card ref={cardRef} style={{ width:1000, height: 800 }} /> {/* 图表容器 */}
      <Card style={{ width: 700, height: 800, overflowY: 'auto' }}>
        {/* 如果选中了节点，显示节点详情 */}
        {selectedNode && (
          <Descriptions title="Node Details" bordered>
            {/* 显示节点的名称，独占一行 */}
            <Descriptions.Item label="Name" span={2}>
              {selectedNode.name}
            </Descriptions.Item>
            {/*空白占位*/}<Descriptions.Item label="" span={2}>{}</Descriptions.Item>
            {/* 显示节点的属性，每个属性单独一行并缩进显示 */}
            {Object.entries(selectedNode.properties).map(([key, value]) => (
              <Descriptions.Item key={key} label={key} span={2} style={{ paddingLeft: '20px' }}>
                {truncateString(value, 30)}
              </Descriptions.Item>
            ))}
            {/* 如果节点包含 annotatedImage 属性，显示图片 */}
            {selectedNode.properties.annotatedImage && (
              <Descriptions.Item label="Annotated Image" span={2}>
                <Image src={selectedNode.properties.annotatedImage} />
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
        {/* 如果选中了链接，显示链接详情 */}
        {selectedLink && (
          <Descriptions title="Link Details" bordered>
            {/* 显示链接的名称，独占一行 */}
            <Descriptions.Item label="Name" span={2}>
              {selectedLink.name}
            </Descriptions.Item>
            {/*空白占位*/}<Descriptions.Item label="" span={2}>{}</Descriptions.Item>
            {/* 显示链接的属性，每个属性单独一行并缩进显示 */}
            {Object.entries(selectedLink.properties).map(([key, value]) => (
              <Descriptions.Item key={key} label={key} span={2} style={{ paddingLeft: '20px' }}>
                {truncateString(value, 30)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Card>
    </div>
  );
};

export default Neo4jVisualization; // 导出组件
