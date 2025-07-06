import { faCodeBranch, faUndoAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Empty, Popconfirm, Tooltip, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React from 'react';
import './index.css';

const { Text } = Typography;

interface VersionHistoryViewerProps {
    treeData: DataNode[];
    activePath: string[];
    onCheckout: (nodeId: string) => void;
    onPreview: (nodeId: string) => void;
    onPreviewEnd: () => void;
    noHistoryText?: string;
    revertText?: string;
    revertConfirmTitle?: string;
    cancelText?: string;
}

const VersionHistoryViewer: React.FC<VersionHistoryViewerProps> = ({
    treeData,
    activePath,
    onCheckout,
    onPreview,
    onPreviewEnd,
    noHistoryText = '无历史记录',
    revertText = '恢复',
    revertConfirmTitle = '确定要从此版本创建分支吗?',
    cancelText = '取消',
}) => {
    if (!treeData || treeData.length === 0) {
        return <Empty description={noHistoryText} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    // Bedrock V4.2.1 Fix: This function now safely constructs the title from raw data,
    // avoiding any type ambiguity from the `node.title` property.
    const titleRender = (node: DataNode) => {
        // We can safely access these because useVersionControl now enriches the DataNode
        const { summary, timestamp } = node as any;
        const key = node.key as string;

        const isActiveNode = activePath.includes(key);
        const isHeadNode = activePath[0] === key;
        const formattedTime = new Date(timestamp).toLocaleTimeString();

        return (
            <div
                className="history-tree-node"
                onMouseEnter={() => onPreview(key)}
                onMouseLeave={onPreviewEnd}
            >
                <div className="history-node-title-wrapper">
                    <Text className="history-node-title" strong={isActiveNode} ellipsis title={`${summary} - ${formattedTime}`}>
                        {isHeadNode && 'HEAD -> '}
                        {`${summary} - ${formattedTime}`}
                    </Text>
                </div>
                <Popconfirm
                    title={revertConfirmTitle}
                    onConfirm={() => onCheckout(key)}
                    okText={revertText}
                    cancelText={cancelText}
                    disabled={isHeadNode}
                >
                    <Tooltip title={isHeadNode ? "当前已是最新版本" : "从此版本创建新分支并切换"} >
                        <Button
                            size="small"
                            type="text"
                            icon={<FontAwesomeIcon icon={faUndoAlt} />}
                            className="history-node-action"
                            disabled={isHeadNode}
                        />
                    </Tooltip>
                </Popconfirm>
            </div>
        );
    };

    return (
        <div className="history-tree-container">
            <Tree
                showLine
                blockNode
                switcherIcon={<FontAwesomeIcon icon={faCodeBranch} />}
                defaultExpandAll
                expandedKeys={activePath}
                selectedKeys={[activePath[0]]}
                treeData={treeData}
                titleRender={titleRender}
            />
        </div>
    );
};

export default VersionHistoryViewer;