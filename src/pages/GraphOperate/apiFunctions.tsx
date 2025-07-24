// FILE: apiFunctions.tsx

/**
 * 此文件作为前端组件与后端API服务的中间层.
 * 它封装了所有对后端图数据库操作的调用, 并统一处理了消息提示和错误日志.
 * 所有函数都基于 umi 生成的 request 函数进行封装.
 */

import { message } from 'antd';
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
  updateRelationshipUsingPut,
} from '@/services/backend/graphController'; // 假设这是umi生成的API服务文件路径

// ===================================================================
// 节点操作 (Node Operations)
// ===================================================================

/** 创建节点 */
export const createNode = async (node: API.NodeCreateRequest): Promise<boolean> => {
  try {
    const response = await createNodeUsingPost(node);
    if (response.code === 0) {
      message.success('节点创建成功');
      return true;
    } else {
      message.error(`节点创建失败: ${response.message || '未知错误'}`);
      return false;
    }
  } catch (error: any) {
    message.error(`节点创建请求失败: ${error.message}`);
    console.error('Create Node Error:', error);
    return false;
  }
};

/** 删除节点 */
export const deleteNode = async (node: API.NodeDeleteRequest): Promise<void> => {
  try {
    await deleteNodeUsingDelete(node);
    message.success('节点删除成功');
  } catch (error: any) {
    message.error(`节点删除失败: ${error.message}`);
    console.error('Delete Node Error:', error);
  }
};

/** 更新节点 */
export const updateNode = async (node: API.NodeUpdateRequest): Promise<void> => {
  try {
    await updateNodeUsingPut(node);
    message.success('节点更新成功');
  } catch (error: any) {
    message.error(`节点更新失败: ${error.message}`);
    console.error('Update Node Error:', error);
  }
};

/** 查找节点 */
export const findNode = async (query: API.NodeQueryRequest): Promise<API.BaseResponseNodeVO_ | null> => {
  try {
    const response = await findNodeUsingPost(query);
    if (response.code === 0 && response.data) {
      message.success('节点查找成功');
    } else {
      message.warning(response.message || '节点不存在');
    }
    return response;
  } catch (error: any) {
    message.error(`节点查找失败: ${error.message}`);
    console.error('Find Node Error:', error);
    return null;
  }
};

/** 获取所有节点 */
export const getAllNodes = async (params: API.NodeGetAllRequest): Promise<API.BaseResponseListNodeVO_ | null> => {
  try {
    return await getAllNodesUsingPost(params);
  } catch (error: any) {
    message.error(`获取全部节点失败: ${error.message}`);
    console.error('Get All Nodes Error:', error);
    return null;
  }
};

// ===================================================================
// 关系操作 (Relationship Operations)
// ===================================================================

/** 创建关系 */
export const createRelationship = async (relationship: API.RelationshipCreateRequest): Promise<void> => {
  try {
    await createRelationshipUsingPost(relationship);
    message.success('关系创建成功');
  } catch (error: any) {
    message.error(`关系创建失败: ${error.message}`);
    console.error('Create Relationship Error:', error);
  }
};

/** 删除关系 */
export const deleteRelationship = async (relationship: API.RelationshipDeleteRequest): Promise<void> => {
  try {
    await deleteRelationshipUsingDelete(relationship);
    message.success('关系删除成功');
  } catch (error: any) {
    message.error(`关系删除失败: ${error.message}`);
    console.error('Delete Relationship Error:', error);
  }
};

/** 更新关系 */
export const updateRelationship = async (relationship: API.RelationshipUpdateRequest): Promise<void> => {
  try {
    await updateRelationshipUsingPut(relationship);
    message.success('关系更新成功');
  } catch (error: any) {
    message.error(`关系更新失败: ${error.message}`);
    console.error('Update Relationship Error:', error);
  }
};

/** 查找关系 */
export const findRelationship = async (query: API.RelationshipQueryRequest): Promise<API.BaseResponseRelationshipVO_ | null> => {
  try {
    const response = await findRelationshipUsingPost(query);
    if (response.code === 0 && response.data) {
      message.success('关系查找成功');
    } else {
      message.warning(response.message || '关系不存在');
    }
    return response;
  } catch (error: any) {
    message.error(`关系查找失败: ${error.message}`);
    console.error('Find Relationship Error:', error);
    return null;
  }
};

/** 获取所有关系 */
export const getAllRelationships = async (params: API.RelationshipGetAllRequest): Promise<API.BaseResponseListRelationshipVO_ | null> => {
  try {
    return await getAllRelationshipsUsingPost(params);
  } catch (error: any) {
    message.error(`获取全部关系失败: ${error.message}`);
    console.error('Get All Relationships Error:', error);
    return null;
  }
};

// END OF FILE: apiFunctions.tsx
