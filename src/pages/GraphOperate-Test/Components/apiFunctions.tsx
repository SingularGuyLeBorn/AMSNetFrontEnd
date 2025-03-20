// 从指定路径的服务模块中导入与图数据库操作相关的函数
import {
  createNodeUsingPost,
  createRelationshipUsingPost,
  deleteNodeUsingDelete,
  deleteRelationshipUsingDelete,
  findNodeUsingPost,
  findRelationshipUsingPost,
  getAllNodesUsingPost,
  getAllRelationshipsUsingPost,
  updateNodeUsingPut,
  updateRelationshipUsingPut
} from '@/services/backend/graphController';
import {message} from "antd";

// 创建节点的异步函数
const createNode = async (node: API.NodeCreateRequest) => {
  try {
    await createNodeUsingPost(node);
    message.success('节点创建成功');
    console.log('Node created');
    return true;
  } catch (error) {
    message.error(`节点创建失败: ${error.message}`);
    console.error(error);
    return false;
  }
};

// 删除节点的异步函数
const deleteNode = async (node: API.NodeDeleteRequest) => {
  try {
    await deleteNodeUsingDelete(node);
    message.success('节点删除成功');
    console.log('Node deleted');
  } catch (error) {
    message.error(`节点删除失败: ${error.message}`);
    console.error(error);
  }
};

// 更新节点的异步函数
const updateNode = async (node: API.NodeUpdateRequest) => {
  try {
    await updateNodeUsingPut(node);
    message.success('节点更新成功');
    console.log('Node updated');
  } catch (error) {
    message.error(`节点更新失败: ${error.message}`);
    console.error(error);
  }
};

// 查找指定节点的异步函数
const findNode = async (query: API.NodeQueryRequest) => {
  try {
    const response = await findNodeUsingPost(query);
    console.log('Node found:', response);
    return response;
  } catch (error) {
    console.error(error);
    message.error(`节点查找失败: ${error.message}`);
    return null;
  }
};

// 获取所有节点的异步函数
async function getAllNodes(params: API.NodeGetAllRequest) {
  try {
    const response = await getAllNodesUsingPost(params);
    message.success('获取全部节点成功');
    console.log('获取全部节点成功：', response);
    return response;
  } catch (error) {
    message.error(`获取全部节点失败: ${error.message}`);
    console.error('获取全部节点失败1：', error);
    throw error;
  }
}

// 创建关系的异步函数
const createRelationship = async (relationship: API.RelationshipCreateRequest) => {
  try {
    await createRelationshipUsingPost(relationship);
    message.success('关系创建成功');
    console.log('Relationship created');
  } catch (error) {
    message.error(`关系创建失败: ${error.message}`);
    console.error(error);
  }
};

// 删除关系的异步函数
const deleteRelationship = async (relationship: API.RelationshipDeleteRequest) => {
  try {
    await deleteRelationshipUsingDelete(relationship);
    message.success('关系删除成功');
    console.log('Relationship deleted');
  } catch (error) {
    message.error(`关系删除失败: ${error.message}`);
    console.error(error);
  }
};

// 更新关系的异步函数
const updateRelationship = async (relationship: API.RelationshipUpdateRequest) => {
  try {
    await updateRelationshipUsingPut(relationship);
    message.success('关系更新成功');
    console.log('Relationship updated');
  } catch (error) {
    message.error(`关系更新失败: ${error.message}`);
    console.error(error);
  }
};

// 查找指定关系的异步函数
const findRelationship = async (query: API.RelationshipQueryRequest) => {
  try {
    const response = await findRelationshipUsingPost(query);
    message.success('关系查找成功');
    console.log('Relationship found:', response);
    return response;
  } catch (error) {
    message.error(`关系查找失败: ${error.message}`);
    console.error(error);
    return null;
  }
};

// 获取所有关系的异步函数
const getAllRelationships = async (params: API.RelationshipGetAllRequest) => {
  try {
    const response = await getAllRelationshipsUsingPost(params);
    message.success('获取全部关系成功');
    return response;
  } catch (error) {
    message.error(`获取全部关系失败: ${error.message}`);
    console.error("获取全部关系失败1：", error);
    return null;
  }
}

// 导出函数
export { createRelationship, deleteRelationship, updateRelationship, findRelationship };
export { createNode, deleteNode, updateNode, findNode };
export { getAllNodes, getAllRelationships };
