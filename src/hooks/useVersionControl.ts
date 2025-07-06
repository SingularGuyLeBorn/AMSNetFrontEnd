import type { DataNode } from 'antd/es/tree';
import { nanoid } from 'nanoid';
import { useMemo } from 'react';

export interface HistoryNode<T> {
  id: string; // Unique version ID
  parentId: string | null; // Parent version ID, null for the root
  timestamp: number;
  summary: string;
  state: T; // Full state snapshot
}

export interface VersionHistory<T> {
  nodes: Record<string, HistoryNode<T>>; // Collection of all version nodes
  head: string; // Pointer to the current active version ID
  root: string; // Root node ID
}

// Bedrock V4.2.1 Change: Enrich DataNode with all properties from HistoryNode for type-safe rendering.
type EnrichedDataNode<T> = DataNode & HistoryNode<T>;

/**
 * @description A custom hook to manage a Git-like version history tree for a given state.
 * @template T The type of the state being versioned.
 * @param {VersionHistory<T> | undefined} history - The current version history object.
 * @param {(history: VersionHistory<T>) => void} setHistory - The state setter function for the history object.
 * @param {T} initialState - The initial state to use when creating a new history.
 * @returns An object containing version control actions and derived state.
 */
export const useVersionControl = <T>(
  history: VersionHistory<T> | undefined,
  setHistory: (history: VersionHistory<T>) => void,
  initialState: T,
) => {
  /**
   * @description Creates a new history tree if one doesn't exist.
   * @returns The newly created or existing history object.
   */
  const ensureHistory = (): VersionHistory<T> => {
    if (history) {
      return history;
    }
    const rootId = nanoid();
    const rootNode: HistoryNode<T> = {
      id: rootId,
      parentId: null,
      timestamp: Date.now(),
      summary: '初始版本',
      state: initialState,
    };
    const newHistory: VersionHistory<T> = {
      nodes: { [rootId]: rootNode },
      head: rootId,
      root: rootId,
    };
    return newHistory;
  };

  /**
   * @description Commits a new state to the history, creating a new node.
   * @param {string} summary - A brief description of the change.
   * @param {T} newState - The new state to be saved.
   */
  const commit = (summary: string, newState: T) => {
    const currentHistory = ensureHistory();
    const newId = nanoid();
    const newNode: HistoryNode<T> = {
      id: newId,
      parentId: currentHistory.head,
      timestamp: Date.now(),
      summary,
      state: newState,
    };

    setHistory({
      ...currentHistory,
      nodes: { ...currentHistory.nodes, [newId]: newNode },
      head: newId,
    });
  };

  /**
   * @description Checks out a specific version, making it the new head. This effectively creates a branch.
   * @param {string} nodeId - The ID of the node to check out.
   * @returns The state of the checked-out node, or null if not found.
   */
  const checkout = (nodeId: string): T | null => {
    const currentHistory = ensureHistory();
    const targetNode = currentHistory.nodes[nodeId];

    if (!targetNode) {
      return null;
    }

    // Checking out the current head does nothing.
    if (currentHistory.head === nodeId) {
      return targetNode.state;
    }

    const newId = nanoid();
    const newNode: HistoryNode<T> = {
      id: newId,
      parentId: nodeId, // The new node branches from the checked-out node
      timestamp: Date.now(),
      summary: `从版本 ${new Date(targetNode.timestamp).toLocaleTimeString()} 恢复`,
      state: targetNode.state, // The new state is the state of the checked-out node
    };

    setHistory({
      ...currentHistory,
      nodes: { ...currentHistory.nodes, [newId]: newNode },
      head: newId,
    });

    return targetNode.state;
  };

  /**
   * @description Moves the head pointer to the parent of the current head, effectively performing an "undo".
   * @returns The state of the parent node, or null if at the root.
   */
  const undo = (): T | null => {
    const currentHistory = ensureHistory();
    const headNode = currentHistory.nodes[currentHistory.head];
    if (!headNode || !headNode.parentId) {
      return null;
    }
    const parentNode = currentHistory.nodes[headNode.parentId];
    if (parentNode) {
      setHistory({ ...currentHistory, head: parentNode.id });
      return parentNode.state;
    }
    return null;
  };

  /**
   * @description Moves the head pointer to a child of the current head, effectively performing a "redo".
   *              It will redo to the most recent child branch.
   * @returns The state of the child node, or null if no children exist.
   */
  const redo = (): T | null => {
    const currentHistory = ensureHistory();
    const children = Object.values(currentHistory.nodes).filter(
      (node) => node.parentId === currentHistory.head,
    );

    if (children.length === 0) {
      return null;
    }

    // Redo to the most recently created child branch.
    const childToRedo = children.sort((a, b) => b.timestamp - a.timestamp)[0];
    setHistory({ ...currentHistory, head: childToRedo.id });
    return childToRedo.state;
  };

  const { treeData, activePath } = useMemo(() => {
    if (!history) return { treeData: [], activePath: [] };

    const { nodes, root, head } = history;
    const childrenMap: Record<string, HistoryNode<T>[]> = {};
    Object.values(nodes).forEach((node) => {
      if (node.parentId) {
        if (!childrenMap[node.parentId]) {
          childrenMap[node.parentId] = [];
        }
        childrenMap[node.parentId].push(node);
      }
    });

    // Sort children by timestamp to maintain a consistent order
    for (const parentId in childrenMap) {
      childrenMap[parentId].sort((a, b) => a.timestamp - b.timestamp);
    }

    const buildTree = (nodeId: string): EnrichedDataNode<T> => {
      const node = nodes[nodeId];
      const children = childrenMap[nodeId] || [];
      return {
        ...node, // Pass all original node data to the renderer
        key: node.id,
        // Title is now just for data, rendering is handled by titleRender prop.
        // It can be an empty string or the raw summary.
        title: node.summary,
        children: children.map((child) => buildTree(child.id)),
      };
    };

    const tree = buildTree(root);

    // Find the path from the root to the head to expand the active branch
    const path: string[] = [];
    let current = nodes[head];
    while (current) {
      path.push(current.id);
      if (current.parentId) {
        current = nodes[current.parentId];
      } else {
        break;
      }
    }

    return { treeData: [tree], activePath: path };
  }, [history]);

  return {
    commit,
    checkout,
    undo,
    redo,
    history,
    canUndo: !!(history && history.nodes[history.head]?.parentId),
    canRedo: !!(history && Object.values(history.nodes).some((n) => n.parentId === history.head)),
    treeData,
    activePath,
  };
};