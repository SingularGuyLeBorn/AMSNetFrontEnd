// FILE: src/pages/GraphOperate/index.tsx

import React, { useEffect, useState } from 'react';
import { useModel } from '@umijs/max';
import './index.css';
import {
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
  SyncOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Button, Input, Layout, message, Tabs, Typography, Space } from 'antd';
import GraphVisualization from './GraphVisualization';

const { Title } = Typography;
const { Content, Sider } = Layout;
const { TabPane } = Tabs;

// ===================================================================
// 前端内部接口与类型定义 (Component-Internal Interfaces & Types)
// ===================================================================
interface Property {
  key: string;
  value: string;
}

export interface Node {
  id: string;
  name: string;
  properties: { [key: string]: any };
}

export interface Relationship {
  id: string;
  name: string;
  properties: { [key: string]: any };
}

// 模仿后端的VO结构以保持类型一致性
export declare namespace API {
  type NodeVO = {
    name?: string;
    properties?: Record<string, any>;
  };
  type RelationshipVO = {
    name?: string;
    properties?: Record<string, any>;
  };
}

export interface GraphData {
  nodes: Node[];
  relationships: Relationship[];
}

type LoadingActions = Record<string, boolean>;

// ===================================================================
// 模拟数据生成 (Mock Data Generation)
// ===================================================================
const getMockData = (): Promise<{ nodes: API.NodeVO[]; relationships: API.RelationshipVO[] }> => {
  const nodes: API.NodeVO[] = [
    { name: 'Bedrock Project', properties: { type: 'Project', status: 'Active', budget: 500000, team: 'CoreDev' } },
    { name: 'John Doe', properties: { type: 'Developer', role: 'Lead Engineer', expertise: 'Frontend', team: 'CoreDev' } },
    { name: 'Jane Smith', properties: { type: 'Developer', role: 'Backend Engineer', expertise: 'Database', team: 'CoreDev' } },
    { name: 'Alpha Module', properties: { type: 'Module', parent: 'Bedrock Project', status: 'In Progress' } },
    { name: 'Beta Module', properties: { type: 'Module', parent: 'Bedrock Project', status: 'Completed' } },
    { name: 'AntV G6', properties: { type: 'Technology', domain: 'Frontend', language: 'TypeScript' } },
    { name: 'React', properties: { type: 'Technology', domain: 'Frontend', language: 'JavaScript' } },
    { name: 'TypeScript', properties: { type: 'Technology', domain: 'Language', creator: 'Microsoft' } },
    { name: 'Alibaba', properties: { type: 'Company', industry: 'Technology', location: 'Hangzhou' } },
    { name: 'Meta', properties: { type: 'Company', industry: 'Technology', location: 'Menlo Park' } },
    { name: 'Customer A', properties: { type: 'Customer', region: 'North', level: 'VIP' } },
    { name: 'Customer B', properties: { type: 'Customer', region: 'South', level: 'Standard' } },
    { name: 'Product X', properties: { type: 'Product', category: 'Software' } },
    { name: 'Service Y', properties: { type: 'Service', provider: 'Cloud Solutions Inc.' } },
    { name: 'Cloud Solutions Inc.', properties: { type: 'Company', industry: 'Cloud Computing' } },
  ];

  const relationships: API.RelationshipVO[] = [
    { name: 'WORKS_ON', properties: { fromNode: 'John Doe', toNode: 'Bedrock Project', role: 'Lead' } },
    { name: 'WORKS_ON', properties: { fromNode: 'Jane Smith', toNode: 'Bedrock Project', role: 'Backend Dev' } },
    { name: 'HAS_MODULE', properties: { fromNode: 'Bedrock Project', toNode: 'Alpha Module' } },
    { name: 'HAS_MODULE', properties: { fromNode: 'Bedrock Project', toNode: 'Beta Module' } },
    { name: 'DEPENDS_ON', properties: { fromNode: 'Alpha Module', toNode: 'Beta Module', reason: 'Shared logic' } },
    { name: 'USES_TECH', properties: { fromNode: 'Bedrock Project', toNode: 'AntV G6' } },
    { name: 'USES_TECH', properties: { fromNode: 'Bedrock Project', toNode: 'React' } },
    { name: 'USES_TECH', properties: { fromNode: 'Bedrock Project', toNode: 'TypeScript' } },
    { name: 'SKILLED_IN', properties: { fromNode: 'John Doe', toNode: 'React' } },
    { name: 'SKILLED_IN', properties: { fromNode: 'John Doe', toNode: 'AntV G6' } },
    { name: 'SKILLED_IN', properties: { fromNode: 'Jane Smith', toNode: 'AntV G6' } },
    { name: 'SKILLED_IN', properties: { fromNode: 'John Doe', toNode: 'TypeScript' } },
    { name: 'DEVELOPED_BY', properties: { fromNode: 'React', toNode: 'Meta' } },
    { name: 'MAINTAINS', properties: { fromNode: 'Alibaba', toNode: 'AntV G6' } },
    { name: 'SERVES', properties: { fromNode: 'Bedrock Project', toNode: 'Customer A' } },
    { name: 'CONSUMES', properties: { fromNode: 'Customer B', toNode: 'Product X' } },
    { name: 'PROVIDES', properties: { fromNode: 'Cloud Solutions Inc.', toNode: 'Service Y' } },
    { name: 'RELATED_TO', properties: { fromNode: 'Product X', toNode: 'Service Y' } },
  ];

  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ nodes, relationships });
    }, 500);
  });
};


// ===================================================================
// 国际化文本 (i18n Translations)
// ===================================================================
const translations = {
  zh: {
    controls: '操作面板',
    createNode: '创建节点',
    deleteNode: '删除节点',
    updateNode: '更新节点',
    findNode: '查询节点',
    createRelationship: '创建关系',
    deleteRelationship: '删除关系',
    updateRelationship: '更新关系',
    findRelationship: '查询关系',
    getAllGraph: '获取/刷新全图',
    nodeName: '节点名称',
    relationshipName: '关系名称',
    key: '属性名',
    value: '属性值',
    addProperty: '添加属性',
    nodeOperations: '节点操作',
    relationshipOperations: '关系操作',
    graphVisualization: '知识图谱可视化',
    nodeNameRequired: '节点名称不能为空',
    relationshipNameRequired: '关系名称不能为空',
    fromToRequired: '创建关系必须在属性中指定 fromNode 和 toNode',
    loadingData: '正在加载图谱数据...',
    dataLoaded: '图谱数据加载完成',
    initialPrompt: '请点击“获取/刷新全图”按钮以加载知识图谱',
  },
  en: {
    controls: 'Controls',
    createNode: 'Create Node',
    deleteNode: 'Delete Node',
    updateNode: 'Update Node',
    findNode: 'Find Node',
    createRelationship: 'Create Relationship',
    deleteRelationship: 'Delete Relationship',
    updateRelationship: 'Update Relationship',
    findRelationship: 'Find Relationship',
    getAllGraph: 'Get/Refresh Full Graph',
    nodeName: 'Node Name',
    relationshipName: 'Relationship Name',
    key: 'Property Key',
    value: 'Property Value',
    addProperty: 'Add Property',
    nodeOperations: 'Node Operations',
    relationshipOperations: 'Relationship Operations',
    graphVisualization: 'Knowledge Graph Visualization',
    nodeNameRequired: 'Node name is required',
    relationshipNameRequired: 'Relationship name is required',
    fromToRequired: 'Must specify fromNode and toNode in properties to create a relationship',
    loadingData: 'Loading graph data...',
    dataLoaded: 'Graph data loaded successfully',
    initialPrompt: 'Click "Get/Refresh Full Graph" to load the knowledge graph',
  },
};

// ===================================================================
// 主组件 (Main Component)
// ===================================================================
const GraphOperate: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  const [collapsed, setCollapsed] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [nodeProperties, setNodeProperties] = useState<Property[]>([{ key: '', value: '' }]);

  const [relationshipName, setRelationshipName] = useState('');
  const [relationshipProperties, setRelationshipProperties] = useState<Property[]>([
    { key: 'fromNode', value: '' },
    { key: 'toNode', value: '' },
  ]);

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingActions, setLoadingActions] = useState<LoadingActions>({});

  useEffect(() => {
    setCurrentLang(initialState?.language || 'zh');
  }, [initialState?.language]);

  const handleGetAllGraph = async () => {
    setLoadingActions(prev => ({ ...prev, getAllGraph: true }));
    message.loading({ content: t.loadingData, key: 'loading' });
    try {
      const { nodes: nodesRes, relationships: relsRes } = await getMockData();

      const transformedNodes: Node[] = (nodesRes || []).map((node: API.NodeVO) => ({
        id: node.name!,
        name: node.name!,
        properties: { ...node.properties, name: node.name },
      }));

      const transformedRelationships: Relationship[] = (relsRes || []).map(
        (rel: API.RelationshipVO, index: number) => ({
          id: `${rel.properties?.fromNode}-${rel.name}-${rel.properties?.toNode}-${index}`,
          name: rel.name || 'unnamed_relationship',
          properties: rel.properties || {},
        }),
      );

      setGraphData({ nodes: transformedNodes, relationships: transformedRelationships });
      message.success({ content: t.dataLoaded, key: 'loading', duration: 2 });
    } catch (error) {
      message.error({ content: '加载图谱数据失败', key: 'loading', duration: 2 });
    } finally {
      setLoadingActions(prev => ({ ...prev, getAllGraph: false }));
    }
  };

  const propertiesToObject = (props: Property[]) => {
    return props.reduce((acc, prop) => {
      if (prop.key) acc[prop.key.trim()] = prop.value;
      return acc;
    }, {} as { [key: string]: any });
  };

  const handleAddProperty = (type: 'node' | 'relationship') => {
    const setter = type === 'node' ? setNodeProperties : setRelationshipProperties;
    setter(prev => [...prev, { key: '', value: '' }]);
  };

  const handleUpdateProperty = (
    type: 'node' | 'relationship',
    index: number,
    field: 'key' | 'value',
    val: string,
  ) => {
    const setter = type === 'node' ? setNodeProperties : setRelationshipProperties;
    setter(prev => {
      const newProps = [...prev];
      newProps[index][field] = val;
      return newProps;
    });
  };

  const handleRemoveProperty = (type: 'node' | 'relationship', index: number) => {
    const setter = type === 'node' ? setNodeProperties : setRelationshipProperties;
    setter(prev => prev.filter((_, i) => i !== index));
  };

  // 模拟的 CRUD 操作
  const handleCreateNode = () => { if (!nodeName) { message.warning(t.nodeNameRequired); return; } message.info(`(模拟) 创建节点: ${nodeName}`); };
  const handleDeleteNode = () => { if (!nodeName) { message.warning(t.nodeNameRequired); return; } message.info(`(模拟) 删除节点: ${nodeName}`); };
  const handleUpdateNode = () => { if (!nodeName) { message.warning(t.nodeNameRequired); return; } message.info(`(模拟) 更新节点: ${nodeName}`); };
  const handleCreateRelationship = () => { if (!relationshipName) { message.warning(t.relationshipNameRequired); return; } const props = propertiesToObject(relationshipProperties); if (!props.fromNode || !props.toNode) { message.warning(t.fromToRequired); return; } message.info(`(模拟) 创建关系: ${relationshipName}`); };
  const handleDeleteRelationship = () => { if (!relationshipName) { message.warning(t.relationshipNameRequired); return; } message.info(`(模拟) 删除关系: ${relationshipName}`); };
  const handleUpdateRelationship = () => { if (!relationshipName) { message.warning(t.relationshipNameRequired); return; } message.info(`(模拟) 更新关系: ${relationshipName}`); };

  const renderPropertiesEditor = (type: 'node' | 'relationship') => {
    const properties = type === 'node' ? nodeProperties : relationshipProperties;
    return (
      <div className="properties-editor">
        <div className="properties-list">
          {properties.map((prop, index) => (
            <Space.Compact key={index} block>
              <Input placeholder={t.key} value={prop.key} onChange={e => handleUpdateProperty(type, index, 'key', e.target.value)} />
              <Input placeholder={t.value} value={prop.value} onChange={e => handleUpdateProperty(type, index, 'value', e.target.value)} />
              <Button danger icon={<DeleteOutlined />} onClick={() => handleRemoveProperty(type, index)} />
            </Space.Compact>
          ))}
        </div>
        <Button type="dashed" onClick={() => handleAddProperty(type)} icon={<PlusOutlined />} block>
          {t.addProperty}
        </Button>
      </div>
    );
  };

  return (
    <Layout className="graph-operate-layout">
      <Sider
        theme="light"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={350}
        className="control-sider"
        trigger={null}
      >
        <div className="control-sider-header">
          {!collapsed && <Title level={5}>{t.controls}</Title>}
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
        {!collapsed && (
          <Tabs defaultActiveKey="node-ops" type="card" className="control-tabs">
            <TabPane tab={t.nodeOperations} key="node-ops">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Input size="large" placeholder={t.nodeName} value={nodeName} onChange={e => setNodeName(e.target.value)} />
                {renderPropertiesEditor('node')}
                <div className="action-buttons">
                  <Button type="primary" onClick={handleCreateNode} icon={<PlusOutlined />}>{t.createNode}</Button>
                  <Button onClick={() => message.info(`(模拟) 查询节点: ${nodeName}`)} icon={<SearchOutlined />}>{t.findNode}</Button>
                  <Button onClick={handleUpdateNode}>{t.updateNode}</Button>
                  <Button danger onClick={handleDeleteNode}>{t.deleteNode}</Button>
                </div>
              </Space>
            </TabPane>
            <TabPane tab={t.relationshipOperations} key="rel-ops">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Input size="large" placeholder={t.relationshipName} value={relationshipName} onChange={e => setRelationshipName(e.target.value)} />
                {renderPropertiesEditor('relationship')}
                <div className="action-buttons">
                  <Button type="primary" onClick={handleCreateRelationship} icon={<PlusOutlined />}>{t.createRelationship}</Button>
                  <Button onClick={() => message.info(`(模拟) 查询关系: ${relationshipName}`)} icon={<SearchOutlined />}>{t.findRelationship}</Button>
                  <Button onClick={handleUpdateRelationship}>{t.updateRelationship}</Button>
                  <Button danger onClick={handleDeleteRelationship}>{t.deleteRelationship}</Button>
                </div>
              </Space>
            </TabPane>
          </Tabs>
        )}
      </Sider>
      <Layout>
        <Content className="visualization-content">
          <div className="visualization-wrapper">
            <div className="visualization-header">
              <Title level={4}>{t.graphVisualization}</Title>
              <Button type="primary" onClick={handleGetAllGraph} icon={<SyncOutlined />} loading={loadingActions.getAllGraph}>
                {t.getAllGraph}
              </Button>
            </div>
            <div className="visualization-container">
              {graphData ? (
                <GraphVisualization data={graphData} />
              ) : (
                <div className="initial-prompt-container">
                  <p>{t.initialPrompt}</p>
                </div>
              )}
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default GraphOperate;
