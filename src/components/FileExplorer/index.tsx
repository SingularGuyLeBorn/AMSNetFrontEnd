// START OF FILE src/components/FileExplorer/index.tsx
import type { DirectoryNode, FileTreeNode } from '@/models/fileTree';
import { faFolder } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useModel } from '@umijs/max';
import { AutoComplete, Empty, Input, Tooltip, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useMemo } from 'react';

const { Text } = Typography;

interface FileExplorerProps {
    onFileSelect: (filePath: string) => void;
    activeFilePath: string | null; // Bedrock V4 Change: Receive active path as a prop
    modifiedFiles: Record<string, number>;
}

// Whitelist of image extensions to display in the file tree
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp'];

/**
 * @description A file explorer component with search and natural sorting.
 * It only displays image files and prunes empty directories.
 */
const FileExplorer: React.FC<FileExplorerProps> = ({ onFileSelect, activeFilePath, modifiedFiles }) => {
    const { fileTree } = useModel('annotationStore');

    /**
     * @description Recursively flattens the file tree to get a list of all image files for searching.
     * @param {FileTreeNode} node - The current node to process.
     * @returns {{ value: string; label: string }[]} An array of objects for AutoComplete.
     */
    const getImageFiles = (node: FileTreeNode): { value: string; label: string }[] => {
        let files: { value: string; label: string }[] = [];
        if (node.isLeaf) {
            if (IMAGE_EXTENSIONS.some(ext => node.title.toLowerCase().endsWith(ext))) {
                files.push({ value: node.key, label: node.title });
            }
        } else {
            const dirNode = node as DirectoryNode;
            for (const child of dirNode.children) {
                files = files.concat(getImageFiles(child));
            }
        }
        return files;
    };

    const searchableFiles = useMemo(() => {
        if (!fileTree) return [];
        return getImageFiles(fileTree);
    }, [fileTree]);

    /**
     * @description Renders the title for a tree node, including a modification indicator.
     * @param {string} title - The title of the node.
     * @param {number | undefined} timestamp - The modification timestamp.
     * @returns {React.ReactNode} The rendered JSX for the title.
     */
    const renderTitle = (title: string, timestamp?: number): React.ReactNode => {
        const isModified = !!timestamp;
        const modifiedTime = isModified ? new Date(timestamp).toLocaleString() : '';

        return (
            <Tooltip title={isModified ? `最后修改: ${modifiedTime}` : ''} placement="right">
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{title}</span>
                    {isModified && <Text style={{ color: '#faad14', fontSize: '14px', lineHeight: 1 }}>*</Text>}
                </span>
            </Tooltip>
        );
    };

    /**
     * @description Recursively converts and filters the internal file tree to Ant Design's TreeData.
     * Prunes non-image files and empty directories.
     * @param {FileTreeNode} node - The current node from the internal file tree.
     * @returns {DataNode | null} The corresponding Ant Design DataNode or null if it should be pruned.
     */
    const convertToTreeData = (node: FileTreeNode): DataNode | null => {
        if (node.isLeaf) {
            const isImage = IMAGE_EXTENSIONS.some(ext => node.title.toLowerCase().endsWith(ext));
            return isImage ? {
                key: node.key,
                title: renderTitle(node.title, modifiedFiles[node.key]),
                isLeaf: true,
            } : null;
        } else {
            const dirNode = node as DirectoryNode;
            const children = dirNode.children
                .map(convertToTreeData)
                .filter((child): child is DataNode => child !== null);

            if (children.length === 0) return null;

            return {
                key: node.key,
                title: node.title,
                icon: <FontAwesomeIcon icon={faFolder} />,
                isLeaf: false,
                children: children,
            };
        }
    };

    if (!fileTree) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <Empty description="请上传一个文件夹以开始。" />
            </div>
        );
    }

    const treeData = convertToTreeData(fileTree);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                <AutoComplete
                    style={{ width: '100%' }}
                    options={searchableFiles}
                    onSelect={onFileSelect}
                    filterOption={(inputValue, option) =>
                        option!.label.toLowerCase().includes(inputValue.toLowerCase())
                    }
                    placeholder="按文件名搜索并跳转..."
                >
                    <Input.Search />
                </AutoComplete>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {treeData ? (
                    <Tree
                        showIcon
                        defaultExpandAll
                        autoExpandParent
                        selectedKeys={activeFilePath ? [activeFilePath] : []}
                        onSelect={(selectedKeys, info) => {
                            if (info.node.isLeaf && selectedKeys.length > 0) {
                                onFileSelect(selectedKeys[0] as string);
                            }
                        }}
                        treeData={[treeData]}
                        blockNode
                    />
                ) : (
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                        <Empty description="文件夹中未找到支持的图片文件。" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileExplorer;
// END OF FILE src/components/FileExplorer/index.tsx