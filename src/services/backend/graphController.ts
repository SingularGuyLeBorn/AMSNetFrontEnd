// @ts-ignore
/* eslint-disable */
import { request } from '@umijs/max';

/** createNode POST /api/graph/createNode */
export async function createNodeUsingPost(
  body: API.NodeCreateRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseString_>('/api/graph/createNode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** createRelationship POST /api/graph/createRelationship */
export async function createRelationshipUsingPost(
  body: API.RelationshipCreateRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseString_>('/api/graph/createRelationship', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** deleteNode DELETE /api/graph/deleteNode */
export async function deleteNodeUsingDelete(
  body: API.NodeDeleteRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseString_>('/api/graph/deleteNode', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** deleteRelationship DELETE /api/graph/deleteRelationship */
export async function deleteRelationshipUsingDelete(
  body: API.RelationshipDeleteRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseString_>('/api/graph/deleteRelationship', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** findNode POST /api/graph/findNode */
export async function findNodeUsingPost(
  body: API.NodeQueryRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseNodeVO_>('/api/graph/findNode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** findRelationship POST /api/graph/findRelationship */
export async function findRelationshipUsingPost(
  body: API.RelationshipQueryRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseRelationshipVO_>('/api/graph/findRelationship', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** getAllNodes POST /api/graph/getAllNodes */
export async function getAllNodesUsingPost(
  body: API.NodeGetAllRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseListNodeVO_>('/api/graph/getAllNodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** getAllRelationships POST /api/graph/getAllRelationships */
export async function getAllRelationshipsUsingPost(
  body: API.RelationshipGetAllRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseListRelationshipVO_>('/api/graph/getAllRelationships', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** updateNode PUT /api/graph/updateNode */
export async function updateNodeUsingPut(
  body: API.NodeUpdateRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseString_>('/api/graph/updateNode', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}

/** updateRelationship PUT /api/graph/updateRelationship */
export async function updateRelationshipUsingPut(
  body: API.RelationshipUpdateRequest,
  options?: { [key: string]: any },
) {
  return request<API.BaseResponseString_>('/api/graph/updateRelationship', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    data: body,
    ...(options || {}),
  });
}
