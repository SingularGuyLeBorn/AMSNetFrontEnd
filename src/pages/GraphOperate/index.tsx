// FILE: index.tsx

import React, { useState } from 'react';
import {
  createNode,
  deleteNode,
  updateNode,
  findNode,
  getAllNodes,
  createRelationship,
  deleteRelationship,
  updateRelationship,
  findRelationship,
  getAllRelationships,
} from './apiFunctions';
import './index.css';
import {
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
  SyncOutlined,
  DeploymentUnitOutlined,
  EditOutlined,
  LinkOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, Layout, message, Space, Typography, Tabs, Flex, Empty } from 'antd';
import Neo4jVisualization from './Neo4jVisualization';

const { Title } = Typography;
const { Content, Sider, Header } = Layout;
const { TabPane } = Tabs;

// ===================================================================
// 接口与类型定义 (Interfaces & Type Definitions)
// ===================================================================
interface Node {
  name: string;
  properties: { [key: string]: any };
}

interface Relationship {
  name: string;
  properties: { [key: string]: any };
}

type Property = { key: string; value: string };

// ===================================================================
// Mock 数据定义 (Mock Data Definition)
// --- FIX --- Corrected mock data. The visualization component creates
// relationships from properties automatically. The `relationships`
// array should only contain relationships between main nodes.
// ===================================================================
const mockGraphData = {
  nodes: [
    {
      name: 'ylb_voltage-mode_bandgap_reference_01',
      properties: {
        output: 'fixed_voltage',
        LNR: 'moderate',
        loop_gain: 'high',
        annotatedImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARTSURBVHhe7d3NblRVFedx/57brJsUQoJkI8kejAORk8AkyeToQpwcwcEHcHKCbwC5gBNkckLREl0K8ShISEhCSkBCpbvvta577bU/P79aLalttVZnrer99N8lLa1aVTq13+/3SgghxBCSEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCHk3t/s/O5+fn/+S3e73a6aXgRBCCCGEEEIIIYQQQgghhBBCiLwVb/e/drvdLoQQQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHl3lJa2r4m53W6/9FII9w1vN78hhBBCCCGEEEIIIYQQQoi8I25vPz/t9/unfwh5A7fb3xBCiLweNzf3EEL+I7e39xBCyFvwtpdeCCHkTeTe3kMIeYe43d8ihBBCCCGEEEIIIYQQQggh5I05ubl/3t7efu/vf/97MplMfua/S3/vX29v72Qy+bm5uZnJZPK9vb293d/8pBCi9+R29+f/4v8F/A/gD9D4L38fAAAAAElFTkSuQmCC",
        ImgName: '图片1.png',
        temperature_coefficient: 'moderate',
        PSR: 'moderate',
      },
    },
    {
      name: 'ylb_current-mode bandgap reference_01',
      properties: {
        output: 'variable_voltage',
        LNR: 'moderate',
        loop_gain: 'high',
        annotatedImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARTSURBVHhe7d3NblRVFedx/57brJsUQoJkI8kejAORk8AkyeToQpwcwcEHcHKCbwC5gBNkckLREl0K8ShISEhCSkBCpbvvta577bU/P79aLalttVZnrer99N8lLa1aVTq13+/3SgghxBCSEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCHk3t/s/O5+fn/+S3e73a6aXgRBCCCGEEEIIIYQQQgghhBBCiLwVb/e/drvdLoQQQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/_source_code_changed_too_much",
        ImgName: '图片2.png',
        temperature_coefficient: 'moderate',
        PSR: 'moderate',
      },
    },
    {
      name: 'ylb_voltage-mode_bandgap_reference_02',
      properties: {
        output: 'fixer_voltage',
        LNR: 'moderate',
        loop_gain: 'high',
        annotatedImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARTSURBVHhe7d3NblRVFedx/57brJsUQoJkI8kejAORk8AkyeToQpwcwcEHcHKCbwC5gBNkckLREl0K8ShISEhCSkBCpbvvta577bU/P79aLalttVZnrer99N8lLa1aVTq13+/3SgghxBCSEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCHk3t/s/O5+fn/+S3e73a6aXgRBCCCGEEEIIIYQQQgghhBBCiLwVb/e/drvdLoQQQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHkPt/s/a/b7/dNJQyGEEEIIIYQQQgj5KtzufyyEEKrS7Xb7JaGEEEIIIYQQQgghhBBCCHkRt/s/a7fb7ZfEEkIIIYQQQgghhBBCCCGEEEKIvAVv978mPz//JReCEEIIIYQQQgghhBBCCCGEEEKIvBVv978m+v3+6T+CEEIIIYQQQgghhBBCCCGEEEKIvBVv978mQgghhBBCCHl3lJa2r4m53W6/9FII9w1vN78hhBBCCCGEEEIIIYQQQoi8I25vPz/t9/unfwh5A7fb3xBCiLweNzf3EEL+I7e39xBCyFvwtpdeCCHkTeTe3kMIeYe43d8ihBBCCCGEEEIIIYQQQggh5I05ubl/3t7efu/vf/97MplMfua/S3/vX29v72Qy+bm5uZnJZPK9vb293d/8pBCi9+R29+f/4v8F/A/gD9D4L38fAAAAAElFTkSuQmCC",
        ImgName: 'AMSnet_BGR20.png',
        temperature_coefficient: 'moderate',
        PSR: 'moderate',
      },
    },
    {
      name: 'testnodenew112',
      properties: {
        prop1: 'aaa',
        prop2: 'bbb',
      },
    },
  ],
  relationships: [],
};


// ===================================================================
// 主组件 (Main Component)
// ===================================================================
const GraphOperate = () => {
  // --- 状态管理 (State Management) ---
  const [nodeForm] = Form.useForm();
  const [relationshipForm] = Form.useForm();

  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(false);
  // --- FIX --- Removed the confusing `isInitial` state.
  // The UI will now be derived directly from the data state.
  // const [isInitial, setIsInitial] = useState(true);

  // --- API 操作函数 (API Operations) ---
  const propertiesToObject = (props: Property[] | undefined) => {
    if (!props) return {};
    return props.reduce((acc, prop) => {
      if (prop && prop.key) {
        acc[prop.key] = prop.value;
      }
      return acc;
    }, {} as { [key:string]: any });
  };

  const handleGetAllGraph = async () => {
    setLoading(true);
    message.loading({ content: '正在加载全图数据...', key: 'loading' });
    try {
      const [nodesResult, relsResult] = await Promise.all([
        getAllNodes({ includeProperties: true }),
        getAllRelationships({ includeProperties: true }),
      ]);
      const validNodes = (nodesResult?.data || []).filter(node => !!node.name) as Node[];
      const validRels = (relsResult?.data || []).filter(rel => !!rel.name) as Relationship[];

      setAllNodes(validNodes);
      setAllRelationships(validRels);

      // --- FIX --- No longer need to manage `isInitial` state.
      // if (isInitial) {
      //   setIsInitial(false);
      // }

      message.success({ content: '图谱数据加载完成!', key: 'loading', duration: 2 });
    } catch (error) {
      message.error({ content: '加载失败，请检查网络或联系管理员', key: 'loading', duration: 2 });
    } finally {
      setLoading(false);
    }
  };

  // --- 展示 Mock 数据的处理函数 ---
  const handleShowMockData = () => {
    message.success('已加载示例图谱');
    setAllNodes(mockGraphData.nodes);
    setAllRelationships(mockGraphData.relationships);
    // --- FIX --- No longer need to manage `isInitial` state.
    // if (isInitial) {
    //   setIsInitial(false);
    // }
    if (loading) {
      setLoading(false);
      message.destroy('loading');
    }
  };

  // --- 节点操作 (Node Operations) ---
  const handleNodeAction = async (action: 'create' | 'update' | 'delete' | 'find') => {
    try {
      const values = await nodeForm.validateFields(['name']);
      const { name } = values;
      const allValues = nodeForm.getFieldsValue();
      const properties = propertiesToObject(allValues.properties);

      switch (action) {
        case 'create':
          if (await createNode({ name, properties })) {
            await handleGetAllGraph();
          }
          break;
        case 'update':
          await updateNode({ name, properties });
          await handleGetAllGraph();
          break;
        case 'delete':
          await deleteNode({ name });
          await handleGetAllGraph();
          break;
        case 'find':
          const result = await findNode({ name });
          const foundNode = result?.data as Node;
          if (foundNode?.name) {
            message.success(`节点 "${name}" 已找到`);
            // Optionally, you could highlight this node in the graph
          } else {
            message.warning(result?.message || `节点 "${name}" 不存在`);
          }
          break;
      }
    } catch (errorInfo) {
      console.log('Validation Failed:', errorInfo);
    }
  };

  // --- 关系操作 (Relationship Operations) ---
  const handleRelationshipAction = async (action: 'create' | 'update' | 'delete' | 'find') => {
    try {
      const values = await relationshipForm.validateFields(['name']);
      const { name } = values;
      const allValues = relationshipForm.getFieldsValue();
      const properties = propertiesToObject(allValues.properties);

      switch (action) {
        case 'create':
          if (!properties.fromNode || !properties.toNode) {
            message.warning('创建关系必须在属性中指定 fromNode 和 toNode');
            return;
          }
          await createRelationship({ name, properties });
          await handleGetAllGraph();
          break;
        case 'update':
          await updateRelationship({ name, properties });
          await handleGetAllGraph();
          break;
        case 'delete':
          await deleteRelationship({ name });
          await handleGetAllGraph();
          break;
        case 'find':
          const result = await findRelationship({ name });
          const foundRel = result?.data as Relationship;
          if (foundRel?.name) {
            message.success(`关系 "${name}" 已找到`);
          } else {
            message.warning(result?.message || `关系 "${name}" 不存在`);
          }
          break;
      }
    } catch (errorInfo) {
      console.log('Validation Failed:', errorInfo);
    }
  };

  // --- 渲染函数 (Render Functions) ---
  const renderPropertiesEditor = () => (
    <Form.List name="properties">
      {(fields, { add, remove }) => (
        <div className="properties-list-container">
          {fields.map(({ key, name, ...restField }) => (
            <div key={key} className="property-item-row">
              <Form.Item {...restField} name={[name, 'key']} style={{ flex: 1 }}>
                <Input placeholder="属性名 (Key)" />
              </Form.Item>
              <Form.Item {...restField} name={[name, 'value']} style={{ flex: 1 }}>
                <Input placeholder="属性值 (Value)" />
              </Form.Item>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
            </div>
          ))}
          <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
            添加属性
          </Button>
        </div>
      )}
    </Form.List>
  );

  return (
    <div className="graph-operate-page-wrapper">
      <Layout className="graph-page-layout">
        <Sider width={400} className="graph-page-sider">
          <Tabs defaultActiveKey="node" centered className="operation-panel">
            <TabPane tab={<span><DeploymentUnitOutlined />节点操作</span>} key="node">
              <Form form={nodeForm} layout="vertical" name="node_form">
                <Form.Item
                  name="name"
                  label="节点名称"
                  rules={[{ required: true, message: '请输入节点名称' }]}
                >
                  <Input placeholder="例如：ylb_voltage-mode_bandgap_reference_01" />
                </Form.Item>
                <Form.Item label="节点属性">
                  {renderPropertiesEditor()}
                </Form.Item>
                <div className="action-buttons-group">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => handleNodeAction('create')}>创建节点</Button>
                    <Button icon={<EditOutlined />} onClick={() => handleNodeAction('update')}>更新节点</Button>
                    <Button icon={<SearchOutlined />} onClick={() => handleNodeAction('find')}>查询节点</Button>
                    <Button danger icon={<DeleteOutlined />} onClick={() => handleNodeAction('delete')}>删除节点</Button>
                  </Space>
                </div>
              </Form>
            </TabPane>
            <TabPane tab={<span><LinkOutlined />关系操作</span>} key="relationship">
              <Form form={relationshipForm} layout="vertical" name="relationship_form">
                <Form.Item
                  name="name"
                  label="关系名称"
                  rules={[{ required: true, message: '请输入关系名称' }]}
                >
                  <Input placeholder="例如：PSR" />
                </Form.Item>
                <Form.Item label="关系属性 (请在此处添加 fromNode 和 toNode)">
                  {renderPropertiesEditor()}
                </Form.Item>
                <div className="action-buttons-group">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => handleRelationshipAction('create')}>创建关系</Button>
                    <Button icon={<EditOutlined />} onClick={() => handleRelationshipAction('update')}>更新关系</Button>
                    <Button icon={<SearchOutlined />} onClick={() => handleRelationshipAction('find')}>查询关系</Button>
                    <Button danger icon={<DeleteOutlined />} onClick={() => handleRelationshipAction('delete')}>删除关系</Button>
                  </Space>
                </div>
              </Form>
            </TabPane>
          </Tabs>
        </Sider>
        <Layout className="graph-page-content-layout">
          <Header className="graph-page-header">
            <Title level={3} style={{ margin: 0 }}>图谱可视化</Title>
            <Space>
              <Button icon={<ApartmentOutlined />} onClick={handleShowMockData}>
                查看示例
              </Button>
              <Button
                type="primary"
                icon={<SyncOutlined spin={loading} />}
                onClick={handleGetAllGraph}
                loading={loading}
              >
                刷新全图
              </Button>
            </Space>
          </Header>
          <Content className="graph-page-main-content">
            {/* --- FIX --- Updated conditional rendering logic */}
            {allNodes.length === 0 ? (
              <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}>
                <Empty description={<span>请点击“刷新全图”加载数据或“查看示例”</span>} />
              </Flex>
            ) : (
              <div className="visualization-container">
                <Neo4jVisualization
                  nodes={allNodes}
                  relationships={allRelationships}
                  key={`${allNodes.length}-${allRelationships.length}`}
                />
              </div>
            )}
          </Content>
        </Layout>
      </Layout>
    </div>
  );
};

export default GraphOperate;
