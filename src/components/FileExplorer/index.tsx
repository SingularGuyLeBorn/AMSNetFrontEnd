// START OF FILE src/components/FileExplorer/index.tsx
import type { FileNode, FileTreeNode } from '@/models/fileTree';
import { FileImageOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons';
import { useModel } from '@umijs/max';
import { Empty, Input, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useMemo, useState } from 'react';
import './index.css';

const { Search } = Input;

interface FileExplorerProps {
    onFileSelect: (filePath: string) => void;
}

/**
 * @description Recursively filters the file tree based on a search term.
 * @param node The current node in the file tree.
 * @param searchTerm The search term to filter by.
 * @returns The filtered node or null if no children match.
 */
const filterTree = (node: FileTreeNode, searchTerm: string): FileTreeNode | null => {
    const term = searchTerm.toLowerCase();

    // For directories, filter their children
    if (!node.isLeaf) {
        const newChildren = node.children
            .map(child => filterTree(child, term))
            .filter((child): child is FileTreeNode => child !== null);

        if (newChildren.length > 0) {
            // Return the directory if it has matching children
            return { ...node, children: newChildren };
        }
        // Return null if no children match
        return null;
    }

    // For files, check if the title matches
    if (node.title.toLowerCase().includes(term)) {
        return node;
    }

    // No match
    return null;
};


const FileExplorer: React.FC<FileExplorerProps> = ({ onFileSelect }) => {
    const { fileTree, currentFilePath } = useModel('annotationStore');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

    /**
     * @description Converts the internal file tree structure to Ant Design's Tree component `DataNode` format.
     *              Also sets default expanded keys to show the root folder.
     * @param node The root of the file tree.
     * @returns An array of DataNode for the Tree component.
     */
    const convertToDataNode = (node: FileTreeNode): DataNode => {
        const isDirectory = !node.isLeaf;
        return {
            key: node.key,
            title: node.title,
            icon: isDirectory ? <FolderOutlined /> : <FileImageOutlined />,
            children: isDirectory ? node.children.map(convertToDataNode) : undefined,
        };
    };

    const treeData = useMemo(() => {
        if (!fileTree) return [];

        // Set initial expanded keys to the root directory
        if (fileTree && expandedKeys.length === 0 && fileTree.key) {
            setExpandedKeys([fileTree.key]);
        }

        let treeToRender: FileTreeNode = fileTree;
        if (searchTerm) {
            const filtered = filterTree(fileTree, searchTerm);
            if (filtered) {
                treeToRender = filtered;
            } else {
                return []; // No results
            }
        }
        return [convertToDataNode(treeToRender)];
    }, [fileTree, searchTerm]);

    const handleSelect = (selectedKeys: React.Key[]) => {
        if (selectedKeys.length > 0) {
            const selectedKey = selectedKeys[0] as string;
            const findNode = (nodes: FileTreeNode[]): FileNode | null => {
                for (const node of nodes) {
                    if (node.key === selectedKey && node.isLeaf) {
                        return node;
                    }
                    if (!node.isLeaf) {
                        const found = findNode(node.children);
                        if (found) return found;
                    }
                }
                return null;
            };
            if (fileTree && findNode([fileTree])) {
                onFileSelect(selectedKey);
            }
        }
    };

    return (
        <div className="file-explorer-container">
            <div className="file-explorer-header">
                <Search
                    placeholder="Search files..."
                    onChange={(e) => setSearchTerm(e.target.value)}
                    allowClear
                />
            </div>
            <div className="file-explorer-tree-wrapper">
                {treeData.length > 0 ? (
                    <Tree
                        showIcon
                        blockNode
                        switcherIcon={(props) =>
                            props.isLeaf ? (
                                <FileImageOutlined style={{ color: '#1890ff' }} />
                            ) : props.expanded ? (
                                <FolderOpenOutlined />
                            ) : (
                                <FolderOutlined />
                            )
                        }
                        treeData={treeData}
                        onSelect={handleSelect}
                        selectedKeys={currentFilePath ? [currentFilePath] : []}
                        expandedKeys={expandedKeys}
                        onExpand={(keys) => setExpandedKeys(keys)}
                    />
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No files or folders found." />
                )}
            </div>
        </div>
    );
};

export default FileExplorer;
// END OF FILE src/components/FileExplorer/index.tsx