import React, { useEffect, useState } from 'react';
import { useModel } from 'umi';
import {
  createNode, deleteNode, updateNode, findNode,
  getAllNodes,
  createRelationship, deleteRelationship, updateRelationship, findRelationship,
  getAllRelationships
} from '@/pages/GraphOperate/Components/apiFunctions';
import './Styles/customStyles.css';
import './Styles/Button.css';

import { Button, Card, Input, Layout, message, Space, Typography, Select } from 'antd';
import Neo4jVisualization from './Components/Neo4jVisualization';
const { Title } = Typography;
const { Content } = Layout;
const { Option } = Select;

// 添加translations对象，定义中英文文本
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
    getAllGraph: '获取整张图',
    nodeName: '节点名称',
    key: '键',
    value: '值',
    addNodeProperty: '添加节点属性',
    removeNodeProperty: '删除',
    addRelationshipProperty: '添加关系属性',
    removeRelationshipProperty: '删除关系属性',
    nodeCRUDOperations: '节点CRUD操作',
    relationshipCRUDOperations: '关系CRUD操作',
    nodeSuccessMessage: '节点查找成功',
    nodeNotExistMessage: '节点不存在',
    languageSelect: '选择语言'
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
    getAllGraph: 'Get All Graph',
    nodeName: 'Node Name',
    key: 'Key',
    value: 'Value',
    addNodeProperty: 'Add Node Property',
    removeNodeProperty: 'Remove',
    addRelationshipProperty: 'Add Relationship Property',
    removeRelationshipProperty: 'Remove Relationship Property',
    nodeCRUDOperations: 'Node CRUD Operations',
    relationshipCRUDOperations: 'Relationship CRUD Operations',
    nodeSuccessMessage: 'Node found successfully',
    nodeNotExistMessage: 'Node does not exist',
    languageSelect: 'Select Language'
  }
};

interface Node {
  id: string; // 确保包含节点的ID
  name: string;
  properties: { [key: string]: any };
}

interface Relationship {
  name: string;
  properties: { [key: string]: any };
}

const GraphOperate = () => {
  // 使用全局语言状态
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  // Update language when global language changes
  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setCurrentLang(customEvent.detail.language);
    };

    window.addEventListener('languageChange', handleLanguageChange);
    setCurrentLang(initialState?.language || 'zh');

    // message.info(currentLang === 'zh' ? '已切换为中文' : 'Language changed to English');

    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, [initialState?.language]);

  // 节点相关状态
  const [name, setName] = useState('');
  const [nodePropertiesKeys, setNodePropertiesKeys] = useState<string[]>([]);
  const [nodePropertiesValues, setNodePropertiesValues] = useState<string[]>([]);
  const [nodeResult, setNodeResult] = useState<Node | null>(null);
  const [allNodes, setAllNodes] = useState<Node[]>([]);

  // 关系相关状态
  const [relationshipName, setRelationshipName] = useState('');
  const [relationshipPropertiesKeys, setRelationshipPropertiesKeys] = useState<string[]>([]);
  const [relationshipPropertiesValues, setRelationshipPropertiesValues] = useState<string[]>([]);
  const [relationshipResult, setRelationshipResult] = useState<Relationship | null>(null);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>([]);

  // 处理节点属性键值对添加
  const handleAddNodeProperty = () => {
    setNodePropertiesKeys([...nodePropertiesKeys, '']);
    setNodePropertiesValues([...nodePropertiesValues, '']);
  };

  // 处理节点属性键值对更新
  const handleUpdateNodeProperty = (index: number, key: string, value: string) => {
    const newKeys = [...nodePropertiesKeys];
    newKeys[index] = key;
    setNodePropertiesKeys(newKeys);
    const newValues = [...nodePropertiesValues];
    newValues[index] = value;
    setNodePropertiesValues(newValues);
  };

  // 处理节点属性键值对删除
  const handleRemoveNodeProperty = (index: number) => {
    const newKeys = [...nodePropertiesKeys];
    newKeys.splice(index, 1);
    setNodePropertiesKeys(newKeys);
    const newValues = [...nodePropertiesValues];
    newValues.splice(index, 1);
    setNodePropertiesValues(newValues);
  };

  // 处理关系属性键值对添加
  const handleAddRelationshipProperty = () => {
    setRelationshipPropertiesKeys([...relationshipPropertiesKeys, '']);
    setRelationshipPropertiesValues([...relationshipPropertiesValues, '']);
  };

  // 处理关系属性键值对更新
  const handleUpdateRelationshipProperty = (index: number, key: string, value: string) => {
    const newKeys = [...relationshipPropertiesKeys];
    newKeys[index] = key;
    setRelationshipPropertiesKeys(newKeys);
    const newValues = [...relationshipPropertiesValues];
    newValues[index] = value;
    setRelationshipPropertiesValues(newValues);
  };

  // 处理关系属性键值对删除
  const handleRemoveRelationshipProperty = (index: number) => {
    const newKeys = [...relationshipPropertiesKeys];
    newKeys.splice(index, 1);
    setRelationshipPropertiesKeys(newKeys);
    const newValues = [...relationshipPropertiesValues];
    newValues.splice(index, 1);
    setRelationshipPropertiesValues(newValues);
  };

  // 创建节点并根据属性查找或创建相关节点
  const handleCreateNode = async () => {
    const propertiesObj = {};
    nodePropertiesKeys.forEach((key, index) => {
      propertiesObj[key] = nodePropertiesValues[index];
    });
    const newNode = { name, properties: propertiesObj };

    try {
      // 尝试创建节点并检查结果
      const result = await createNode(newNode);
      if (result !== true) {
        // 如果结果代码不是0，打印错误信息并退出函数
        console.error(`Failed to create node with error code: ${result}`);
        return;
      }
      // 节点创建成功，设置节点结果
      setNodeResult(newNode);

      // 遍历节点属性，处理关系创建
      for (const [key, value] of Object.entries(propertiesObj)) {
        const nodeName = `${key}_${value}`;
        try {
          const relatedNode = await findNode({ name: nodeName });
          if (!relatedNode) {
            // 如果没有找到同名节点，创建新节点
            let newRelatedNode = { name: nodeName, properties: { [key]: value } };
            await createNode(newRelatedNode);
            console.log(`Created new node ${newRelatedNode.name} because no existing node shared the ${key} value of ${value}`);

            // 创建新节点与原始节点的关系
            await createRelationship({
              name: key, // 关系名称是属性名
              properties: {
                fromNode: newNode.name,
                toNode: newRelatedNode.name
              }
            });
            console.log(`Connected ${newNode.name} to ${newRelatedNode.name} as no node shared the ${key} value of ${value}`);
          } else {
            // 如果找到具有相同属性值的节点，创建关系
            await createRelationship({
              name: key, // 关系名称是属性名
              properties: {
                fromNode: newNode.name,
                toNode: relatedNode.data.name
              }
            });
            console.log(`Connected ${newNode.name} to ${relatedNode.data.name} via property ${key}`);
          }
        } catch (error) {
          console.error(`Error handling property ${key}: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Failed to create initial node: ${error}`);
    }
  };

  // 删除节点
  const handleDeleteNode = async () => {
    await deleteNode({ name });
  };

  // 更新节点
  const handleUpdateNode = async () => {
    const propertiesObj: { [key: string]: any } = {};
    nodePropertiesKeys.forEach((key, index) => {
      propertiesObj[key] = nodePropertiesValues[index];
    });

    const updatedNode: Node = { id: '', name, properties: propertiesObj };
    await updateNode(updatedNode);
    setNodeResult(updatedNode);
  };

  // 查找节点
  const handleFindNode = async () => {
    const result: Node | null = await findNode({ name });
    if (result) {
      setNodeResult(result);
      message.success(t.nodeSuccessMessage);
    } else {
      setNodeResult(null);
      message.warning(t.nodeNotExistMessage);
    }
  };

  // 获取所有节点
  const handleGetAllNodes = async () => {
    const result: Node[] = await getAllNodes({ includeProperties: true });
    setAllNodes(result.data);
  };

  // 创建关系
  const handleCreateRelationship = async () => {
    const propertiesObj: { [key: string]: any } = {};
    relationshipPropertiesKeys.forEach((key, index) => {
      propertiesObj[key] = relationshipPropertiesValues[index];
    });
    const newRelationship: Relationship = { name: relationshipName, properties: propertiesObj };
    await createRelationship(newRelationship);
    setRelationshipResult(newRelationship);
  };

  // 删除关系
  const handleDeleteRelationship = async () => {
    const result = await deleteRelationship({ name: relationshipName });
  };

  // 更新关系
  const handleUpdateRelationship = async () => {
    const propertiesObj: { [key: string]: any } = {};
    relationshipPropertiesKeys.forEach((key, index) => {
      propertiesObj[key] = relationshipPropertiesValues[index];
    });
    const updatedRelationship: Relationship = { name: relationshipName, properties: propertiesObj };
    await updateRelationship(updatedRelationship);
    setRelationshipResult(updatedRelationship);
  };

  // 查找关系
  const handleFindRelationship = async () => {
    const result: Relationship | null = await findRelationship({ name: relationshipName });
  };

  // 获取所有关系
  const handleGetAllRelationships = async () => {
    const result: Relationship[] = await getAllRelationships({ includeProperties: true });
    setAllRelationships(result.data);
  };

  // 获取整张图 先执行 获取节点 再执行获取关系
  const handleGetAllGraph = async () => {
    await handleGetAllNodes();
    await handleGetAllRelationships();
  };

  return (
      <Layout>
        <Content>
          <Card style={{ width: 1700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 1700 }}>
              {/* 左侧：节点CRUD操作 */}
              <div style={{ width: '48%' }}>
                <Title level={2}>{t.nodeCRUDOperations}</Title>
                <Space direction="vertical">
                  <Input
                      placeholder={t.nodeName}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                  />
                  <div>
                    {nodePropertiesKeys.map((key, index) => (
                        <div key={index} style={{ display: 'flex', marginBottom: '5px' }}>
                          <Input
                              placeholder={t.key}
                              value={key}
                              onChange={(e) => handleUpdateNodeProperty(index, e.target.value, nodePropertiesValues[index])}
                          />
                          <Input
                              placeholder={t.value}
                              value={nodePropertiesValues[index]}
                              onChange={(e) => handleUpdateNodeProperty(index, nodePropertiesKeys[index], e.target.value)}
                          />
                          <Button className="button-style" onClick={() => handleRemoveNodeProperty(index)}>
                            {t.removeNodeProperty}
                          </Button>
                        </div>
                    ))}
                    <Button className="button-style" onClick={handleAddNodeProperty}>
                      {t.addNodeProperty}
                    </Button>
                  </div>
                  <div>
                    <Button className="button-style" onClick={handleCreateNode}>
                      {t.createNode}
                    </Button>
                    <Button className="button-style" onClick={handleDeleteNode}>
                      {t.deleteNode}
                    </Button>
                    <Button className="button-style" onClick={handleUpdateNode}>
                      {t.updateNode}
                    </Button>
                    <Button className="button-style" onClick={handleFindNode}>
                      {t.findNode}
                    </Button>
                  </div>
                </Space>
              </div>

              {/* 右侧：关系CRUD操作 */}
              <div style={{ width: '48%' }}>
                <Title level={2}>{t.relationshipCRUDOperations}</Title>
                <Space direction="vertical">
                  <Input
                      placeholder={t.nodeName}
                      value={relationshipName}
                      onChange={(e) => setRelationshipName(e.target.value)}
                  />
                  <div>
                    {relationshipPropertiesKeys.map((key, index) => (
                        <div key={index} style={{ display: 'flex', marginBottom: '5px' }}>
                          <Input
                              placeholder={t.key}
                              value={key}
                              onChange={(e) => handleUpdateRelationshipProperty(index, e.target.value, relationshipPropertiesValues[index])}
                          />
                          <Input
                              placeholder={t.value}
                              value={relationshipPropertiesValues[index]}
                              onChange={(e) => handleUpdateRelationshipProperty(index, relationshipPropertiesKeys[index], e.target.value)}
                          />
                          <Button className="button-style" onClick={() => handleRemoveRelationshipProperty(index)}>
                            {t.removeNodeProperty}
                          </Button>
                        </div>
                    ))}
                    <Button className="button-style" onClick={handleAddRelationshipProperty}>
                      {t.addRelationshipProperty}
                    </Button>
                  </div>
                  <div>
                    <Button className="button-style" onClick={handleCreateRelationship}>
                      {t.createRelationship}
                    </Button>
                    <Button className="button-style" onClick={handleDeleteRelationship}>
                      {t.deleteRelationship}
                    </Button>
                    <Button className="button-style" onClick={handleUpdateRelationship}>
                      {t.updateRelationship}
                    </Button>
                    <Button className="button-style" onClick={handleFindRelationship}>
                      {t.findRelationship}
                    </Button>
                  </div>
                </Space>
              </div>
            </div>

            {/* 下半部分：获取整张图的按钮 */}
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Button className="button-style" onClick={handleGetAllGraph}>
                {t.getAllGraph}
              </Button>
            </div>
          </Card>

          {/* 第二行：可视化组件 */}
          <div style={{ marginTop: '20px' }}>
            <Neo4jVisualization nodes={allNodes} relationships={allRelationships} />
          </div>
        </Content>
      </Layout>
  );
};

export default GraphOperate;
