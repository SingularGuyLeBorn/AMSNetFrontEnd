// index.tsx

import React, { useEffect, useState } from 'react';
import { useModel } from '@umijs/max';
import {
  createNode, deleteNode, updateNode, findNode,
  getAllNodes,
  createRelationship, deleteRelationship, updateRelationship, findRelationship,
  getAllRelationships
} from './apiFunctions';
import './index.css';
import { DeleteOutlined, PlusOutlined, FullscreenOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { Button, Card, Input, Layout, message, Space, Typography, Select, Tabs } from 'antd';
import Neo4jVisualization from './Neo4jVisualization';

const { Title } = Typography;
const { Content } = Layout;
const { Option } = Select;
const { TabPane } = Tabs;

// ===================================================================
// 接口与类型定义 (Interfaces & Type Definitions)
// ===================================================================
// 本地接口保持严格，确保组件内部使用时 name 总是存在的
interface Node {
  name: string;
  properties: { [key: string]: any };
}

interface Relationship {
  name: string;
  properties: { [key: string]: any };
}

// ===================================================================
// 国际化文本 (i18n Translations)
// ===================================================================
const translations = {
  zh: {
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
    key: '键',
    value: '值',
    addProperty: '添加属性',
    nodeOperations: '节点操作',
    relationshipOperations: '关系操作',
    nodeSuccessMessage: '节点查找成功',
    nodeNotExistMessage: '节点不存在',
    relationshipName: '关系名称',
    graphVisualization: '图谱可视化',
  },
  en: {
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
    key: 'Key',
    value: 'Value',
    addProperty: 'Add Property',
    nodeOperations: 'Node Operations',
    relationshipOperations: 'Relationship Operations',
    nodeSuccessMessage: 'Node found successfully',
    nodeNotExistMessage: 'Node does not exist',
    relationshipName: 'Relationship Name',
    graphVisualization: 'Graph Visualization',
  }
};

// ===================================================================
// 主组件 (Main Component)
// ===================================================================
const GraphOperate = () => {
  // --- 状态管理 (State Management) ---
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  // 节点相关状态
  const [name, setName] = useState('');
  const [nodeProperties, setNodeProperties] = useState<{ key: string, value: string }[]>([]);
  const [nodeResult, setNodeResult] = useState<Node | null>(null);
  const [allNodes, setAllNodes] = useState<Node[]>([]);

  // 关系相关状态
  const [relationshipName, setRelationshipName] = useState('');
  const [relationshipProperties, setRelationshipProperties] = useState<{ key: string, value: string }[]>([]);
  const [relationshipResult, setRelationshipResult] = useState<Relationship | null>(null);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>([]);

  // --- 副作用钩子 (useEffect Hooks) ---
  useEffect(() => {
    const handleLanguageChange = (event: Event) => setCurrentLang((event as CustomEvent).detail.language);
    window.addEventListener('languageChange', handleLanguageChange);
    setCurrentLang(initialState?.language || 'zh');
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, [initialState?.language]);

  // --- 属性处理函数 (Property Handlers) ---
  const handleAddProperty = (type: 'node' | 'relationship') => {
    if (type === 'node') {
      setNodeProperties([...nodeProperties, { key: '', value: '' }]);
    } else {
      setRelationshipProperties([...relationshipProperties, { key: '', value: '' }]);
    }
  };

  const handleUpdateProperty = (type: 'node' | 'relationship', index: number, field: 'key' | 'value', val: string) => {
    if (type === 'node') {
      const newProps = [...nodeProperties];
      newProps[index][field] = val;
      setNodeProperties(newProps);
    } else {
      const newProps = [...relationshipProperties];
      newProps[index][field] = val;
      setRelationshipProperties(newProps);
    }
  };

  const handleRemoveProperty = (type: 'node' | 'relationship', index: number) => {
    if (type === 'node') {
      setNodeProperties(nodeProperties.filter((_, i) => i !== index));
    } else {
      setRelationshipProperties(relationshipProperties.filter((_, i) => i !== index));
    }
  };

  const propertiesToObject = (props: { key: string, value: string }[]) => {
    return props.reduce((acc, prop) => {
      if (prop.key) acc[prop.key] = prop.value;
      return acc;
    }, {} as { [key: string]: any });
  };

  // --- 核心API操作函数 (Core API Operations) ---
  const handleCreateNode = async () => {
    if (!name) { message.warning('节点名称不能为空'); return; }
    const propertiesObj = propertiesToObject(nodeProperties);
    const newNode = { name, properties: propertiesObj };
    try {
      const result: any = await createNode(newNode);
      if (result === true || (result && result.code === 0)) {
        message.success(`节点 "${name}" 创建成功`);
        setNodeResult(newNode);
        await handleGetAllGraph();
      } else {
        message.error(`创建节点失败: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      message.error(`创建节点时发生网络或未知错误`);
    }
  };

  const handleDeleteNode = async () => {
    if (!name) { message.warning('请输入要删除的节点名称'); return; }
    await deleteNode({ name });
    message.success(`删除节点 "${name}" 的请求已发送`);
    await handleGetAllGraph();
  };

  const handleUpdateNode = async () => {
    if (!name) { message.warning('请输入要更新的节点名称'); return; }
    const propertiesObj = propertiesToObject(nodeProperties);
    const updatedNode: Node = { name, properties: propertiesObj };
    await updateNode(updatedNode);
    message.success(`更新节点 "${name}" 的请求已发送`);
    setNodeResult(updatedNode);
    await handleGetAllGraph();
  };

  const handleFindNode = async () => {
    if (!name) { message.warning('请输入要查询的节点名称'); return; }
    const result = await findNode({ name });
    const foundNode = (result?.data || result) as Node;
    if (foundNode && foundNode.name) { // 确保name存在
      setNodeResult(foundNode);
      message.success(t.nodeSuccessMessage);
    } else {
      setNodeResult(null);
      message.warning(t.nodeNotExistMessage);
    }
  };

  const handleCreateRelationship = async () => {
    if (!relationshipName) { message.warning('关系名称不能为空'); return; }
    const propertiesObj = propertiesToObject(relationshipProperties);
    if (!propertiesObj.fromNode || !propertiesObj.toNode) {
      message.warning('创建关系必须在属性中指定 fromNode 和 toNode');
      return;
    }
    const newRelationship: Relationship = { name: relationshipName, properties: propertiesObj };
    await createRelationship(newRelationship);
    message.success(`创建关系 "${relationshipName}" 的请求已发送`);
    setRelationshipResult(newRelationship);
    await handleGetAllGraph();
  };

  const handleDeleteRelationship = async () => {
    if (!relationshipName) { message.warning('请输入要删除的关系名称'); return; }
    await deleteRelationship({ name: relationshipName });
    message.success(`删除关系 "${relationshipName}" 的请求已发送`);
    await handleGetAllGraph();
  };

  const handleUpdateRelationship = async () => {
    if (!relationshipName) { message.warning('请输入要更新的关系名称'); return; }
    const propertiesObj = propertiesToObject(relationshipProperties);
    const updatedRelationship: Relationship = { name: relationshipName, properties: propertiesObj };
    await updateRelationship(updatedRelationship);
    message.success(`更新关系 "${relationshipName}" 的请求已发送`);
    setRelationshipResult(updatedRelationship);
    await handleGetAllGraph();
  };

  const handleFindRelationship = async () => {
    if (!relationshipName) { message.warning('请输入要查询的关系名称'); return; }
    const result = await findRelationship({ name: relationshipName });
    const foundRel = (result?.data || result) as Relationship;
    if (foundRel && foundRel.name) { // 确保name存在
      setRelationshipResult(foundRel);
      message.success('关系查找成功');
    } else {
      setRelationshipResult(null);
      message.warning('关系不存在');
    }
  };

  const handleGetAllNodes = async () => {
    const result = await getAllNodes({ includeProperties: true });
    // FIX: 过滤掉API返回的name为undefined或null的节点，并进行类型断言
    const validNodes = (result?.data || []).filter(node => !!node.name);
    setAllNodes(validNodes as Node[]);
  };

  const handleGetAllRelationships = async () => {
    const result = await getAllRelationships({ includeProperties: true });
    // FIX: 过滤掉API返回的name为undefined或null的关系，并进行类型断言
    const validRels = (result?.data || []).filter(rel => !!rel.name);
    setAllRelationships(validRels as Relationship[]);
  };

  const handleGetAllGraph = async () => {
    message.loading('正在加载图谱数据...', 0);
    await Promise.all([handleGetAllNodes(), handleGetAllRelationships()]);
    message.destroy();
    message.success('图谱数据加载完成');
  };

  // --- 渲染函数 (Render Functions) ---
  const renderPropertiesEditor = (type: 'node' | 'relationship') => {
    const props = type === 'node' ? nodeProperties : relationshipProperties;
    return (
      <div className="properties-list">
        {props.map((prop, index) => (
          <div key={index} className="property-row">
            <Input
              placeholder={t.key}
              value={prop.key}
              onChange={(e) => handleUpdateProperty(type, index, 'key', e.target.value)}
            />
            <Input
              placeholder={t.value}
              value={prop.value}
              onChange={(e) => handleUpdateProperty(type, index, 'value', e.target.value)}
            />
            <Button
              type="text"
              danger
              onClick={() => handleRemoveProperty(type, index)}
              icon={<DeleteOutlined />}
            />
          </div>
        ))}
        <Button
          type="dashed"
          onClick={() => handleAddProperty(type)}
          icon={<PlusOutlined />}
        >
          {t.addProperty}
        </Button>
      </div>
    );
  };

  return (
    <Layout>
      <Content className="graph-operate-container">
        <Card className="control-panel-card">
          <Tabs defaultActiveKey="1">
            <TabPane tab={t.nodeOperations} key="1">
              <div className="tab-pane-content">
                <div className="input-section">
                  <Input
                    size="large"
                    placeholder={t.nodeName}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {renderPropertiesEditor('node')}
                </div>
                <div className="action-buttons">
                  <Button type="primary" onClick={handleCreateNode} icon={<PlusOutlined />}>{t.createNode}</Button>
                  <Button onClick={handleFindNode} icon={<SearchOutlined />}>{t.findNode}</Button>
                  <Button onClick={handleUpdateNode}>{t.updateNode}</Button>
                  <Button danger onClick={handleDeleteNode}>{t.deleteNode}</Button>
                </div>
              </div>
            </TabPane>
            <TabPane tab={t.relationshipOperations} key="2">
              <div className="tab-pane-content">
                <div className="input-section">
                  <Input
                    size="large"
                    placeholder={t.relationshipName}
                    value={relationshipName}
                    onChange={(e) => setRelationshipName(e.target.value)}
                  />
                  {renderPropertiesEditor('relationship')}
                </div>
                <div className="action-buttons">
                  <Button type="primary" onClick={handleCreateRelationship} icon={<PlusOutlined />}>{t.createRelationship}</Button>
                  <Button onClick={handleFindRelationship} icon={<SearchOutlined />}>{t.findRelationship}</Button>
                  <Button onClick={handleUpdateRelationship}>{t.updateRelationship}</Button>
                  <Button danger onClick={handleDeleteRelationship}>{t.deleteRelationship}</Button>
                </div>
              </div>
            </TabPane>
          </Tabs>
        </Card>

        <div className="visualization-wrapper">
          <div className="visualization-header">
            <Title level={4} style={{ margin: 0 }}>{t.graphVisualization}</Title>
            <Button type="primary" onClick={handleGetAllGraph} icon={<SyncOutlined />}>{t.getAllGraph}</Button>
          </div>
          <div className="visualization-container">
            <Neo4jVisualization
              nodes={allNodes}
              relationships={allRelationships}
              key={allNodes.length + allRelationships.length}
            />
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default GraphOperate;
