// FILE: src/components/FileExplorerSider/index.tsx
import { DirtyData, MaskImageAnnotationData } from '@/models/annotationStore';
import { useModel } from '@umijs/max';
import { Input, List, Tooltip } from 'antd';
import React, { useMemo, useState } from 'react';
import './index.css';

interface FileExplorerSiderProps {
    currentImageKey: string | null;
    onSelectImage: (imageKey: string) => void;
    fileDirtyYolo: { [key: string]: DirtyData<string> };
    fileDirtyJson: { [key: string]: DirtyData<string> };
    maskAllAnnotations: { [key: string]: MaskImageAnnotationData };
}

const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const FileExplorerSider: React.FC<FileExplorerSiderProps> = ({
    currentImageKey,
    onSelectImage,
    fileDirtyYolo,
    fileDirtyJson,
    maskAllAnnotations,
}) => {
    const { imageKeys, allFileMetadata } = useModel('annotationStore');
    const [searchText, setSearchText] = useState('');

    const filteredImageKeys = useMemo(() => {
        if (!searchText) {
            return imageKeys;
        }
        return imageKeys.filter((key) =>
            key.toLowerCase().includes(searchText.toLowerCase()),
        );
    }, [imageKeys, searchText]);

    const isDirty = (imageKey: string): boolean => {
        return (
            !!fileDirtyYolo[imageKey] ||
            !!fileDirtyJson[imageKey] ||
            !!maskAllAnnotations[imageKey]?.lastModified
        );
    };

    const getTooltipTitle = (imageKey: string): string => {
        const dirtyTimestamp =
            fileDirtyYolo[imageKey]?.lastModified ||
            fileDirtyJson[imageKey]?.lastModified ||
            maskAllAnnotations[imageKey]?.lastModified;

        if (dirtyTimestamp) {
            return `已修改: ${formatTimestamp(dirtyTimestamp)}`;
        }
        const originalTimestamp = allFileMetadata[imageKey]?.originalPngLastModified;
        if (originalTimestamp) {
            return `上传于: ${formatTimestamp(originalTimestamp)}`;
        }
        return '无时间信息';
    };

    return (
        <div className="file-explorer-sider-container">
            <div className="search-wrapper">
                <Input.Search
                    placeholder="搜索图片..."
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />
            </div>
            <div className="file-list-wrapper">
                <List
                    size="small"
                    dataSource={filteredImageKeys}
                    renderItem={(imageKey) => {
                        const dirty = isDirty(imageKey);
                        return (
                            <List.Item
                                onClick={() => onSelectImage(imageKey)}
                                className={`file-list-item ${imageKey === currentImageKey ? 'selected' : ''}`}
                            >
                                <Tooltip title={getTooltipTitle(imageKey)} placement="right">
                                    <div className="file-name-container">
                                        {dirty && <span className="dirty-indicator">*</span>}
                                        <span className="file-name-text" title={imageKey}>
                                            {imageKey}
                                        </span>
                                    </div>
                                </Tooltip>
                            </List.Item>
                        );
                    }}
                />
            </div>
        </div>
    );
};

export default FileExplorerSider;