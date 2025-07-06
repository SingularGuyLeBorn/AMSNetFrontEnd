// START OF FILE src/app.tsx
import Footer from '@/components/Footer';
import type { VersionHistory } from '@/hooks/useVersionControl';
import type { DirectoryNode, FileNode, FileTreeNode } from '@/models/fileTree';
import type { ClassInfo } from '@/pages/FileOperate/constants';
// Bedrock Change: Import helpers with specific aliases to avoid name collisions between pages.
import { convertStandardYoloToInternal as fileOperateConvertYolo } from '@/pages/FileOperate/index';
import type { ApiResponse as MaskApiResponse, ImageAnnotationData as MaskImageAnnotationData } from '@/pages/MaskOperate/constants';

import { convertApiToView, convertApiToView as maskConvertApiToView } from '@/pages/MaskOperate/index';
import { getLoginUserUsingGet } from '@/services/backend/userController';
import { FileZipOutlined, GlobalOutlined, UploadOutlined } from '@ant-design/icons';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import { Button, message, Space, Tooltip, Upload } from 'antd';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { nanoid } from 'nanoid';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import defaultSettings from '../config/defaultSettings';
import { AvatarDropdown } from './components/RightContent/AvatarDropdown';
import { requestConfig } from './requestConfig';

const loginPath = '/user/login';

// Bedrock V4 Change: Add a robust natural sort function for filenames.
/**
 * @description Performs a natural sort on two strings, correctly handling numbers within the string.
 * e.g., "item_2" comes before "item_10".
 * @param {string} a - The first string.
 * @param {string} b - The second string.
 * @returns {number} - A negative, zero, or positive value.
 */
const naturalSort = (a: string, b: string): number => {
  // Regex to split strings into alternating string and number parts
  const re = /(\d+)/g;
  const aParts = a.split(re);
  const bParts = b.split(re);

  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    const partA = aParts[i];
    const partB = bParts[i];

    // If the part is a number (it will be at odd indices of the array)
    if (i % 2 === 1) {
      const numA = parseInt(partA, 10);
      const numB = parseInt(partB, 10);
      if (numA !== numB) {
        return numA - numB;
      }
    } else { // It's a string part
      if (partA !== partB) {
        return partA.localeCompare(partB);
      }
    }
  }

  // If all parts are equal, the shorter string should come first
  return a.length - b.length;
};


// 全局文件上传组件
const GlobalUploader: React.FC = () => {
  const {
    setFileTree,
    setFile_currentFilePath,
    setMask_currentFilePath,
    setFile_yoloFileContents,
    setFile_jsonFileContents,
    setFile_versionHistory,
    setFile_modifiedFiles,
    setMask_allImageAnnotations,
    setMask_versionHistory,
    setMask_classMap,
    setMask_modifiedFiles,
    mask_classMap,
    file_classMap,
  } = useModel('annotationStore');

  /**
   * @description Processes an array of uploaded files, constructs a file tree,
   *              and populates the global annotation stores for ALL pages independently.
   * @param {File[]} files - The array of files from the uploader.
   */
  const handleGlobalUpload = async (files: File[]) => {
    if (!files || files.length === 0) {
      message.warning("文件夹中未选择任何文件。");
      return;
    }
    message.loading({ content: "正在处理文件夹...", key: 'global-upload', duration: 0 });

    const root: DirectoryNode = { key: 'root', title: 'Project', isLeaf: false, children: [] };
    const nodeMap = new Map<string, DirectoryNode>([['root', root]]);
    let firstImageFile: FileNode | null = null;
    const imagePaths: string[] = [];

    const allFiles = files.filter(f => f.size > 0).sort((a, b) => naturalSort(a.webkitRelativePath, b.webkitRelativePath));

    // 1. Build the file tree
    for (const file of allFiles) {
      const pathParts = file.webkitRelativePath.split('/').filter(p => p);
      if (pathParts.length === 0) continue; // Skip empty paths

      const rootFolderName = pathParts[0];
      if (root.title === 'Project') {
        root.title = rootFolderName;
        root.key = rootFolderName;
        nodeMap.set(rootFolderName, root);
        nodeMap.delete('root');
      }

      let currentPath = root.key;
      let currentNode: DirectoryNode = root;

      for (let i = 1; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        const newPath = `${currentPath}/${part}`;
        if (!nodeMap.has(newPath)) {
          const newDirNode: DirectoryNode = {
            key: newPath,
            title: part,
            isLeaf: false,
            children: [],
          };
          currentNode.children.push(newDirNode);
          nodeMap.set(newPath, newDirNode);
          currentNode = newDirNode;
        } else {
          currentNode = nodeMap.get(newPath)!;
        }
        currentPath = newPath;
      }

      const fileName = pathParts[pathParts.length - 1];
      const fileNode: FileNode = {
        key: file.webkitRelativePath,
        title: fileName,
        isLeaf: true,
        file: file,
      };
      currentNode.children.push(fileNode);

      if (file.type.startsWith('image/')) {
        if (!firstImageFile) {
          firstImageFile = fileNode;
        }
        imagePaths.push(fileNode.key);
      }
    }

    setFileTree(root);

    // 2. Prepare annotation data holders
    const yoloContents: Record<string, string> = {};
    const jsonContents: Record<string, string> = {};
    const maskAnnotations: Record<string, MaskImageAnnotationData> = {};
    let tempMaskClassMap: { [key: number]: ClassInfo } = { ...mask_classMap };

    // 3. Populate annotation data from txt and json files
    for (const file of allFiles) {
      const filePath = file.webkitRelativePath;
      const fileExt = filePath.split('.').pop()?.toLowerCase();
      const baseFilePath = filePath.substring(0, filePath.lastIndexOf('.'));

      const imageFileMatch = allFiles.find(f => f.type.startsWith('image/') && f.webkitRelativePath.startsWith(baseFilePath));
      if (!imageFileMatch) continue; // Annotation file without a matching image
      const imagePath = imageFileMatch.webkitRelativePath;

      if (fileExt === 'txt') {
        const content = await file.text();
        yoloContents[imagePath] = fileOperateConvertYolo(content, file_classMap);
      } else if (fileExt === 'json') {
        const content = await file.text();
        jsonContents[imagePath] = content;

        // Also process for MaskOperate
        try {
          const apiJson: MaskApiResponse = JSON.parse(content);
          if (apiJson.key_points || apiJson.segments || apiJson.cpnts) {
            const { viewAnnotations, updatedClassMap } = maskConvertApiToView(apiJson, tempMaskClassMap, 2);
            tempMaskClassMap = updatedClassMap; // Persist newly discovered classes
            maskAnnotations[imagePath] = { viewAnnotations, apiJson };
          }
        } catch (e) {
          // Not a valid mask JSON, ignore for MaskOperate
        }
      }
    }

    // 4. Initialize Version Histories for all image files
    const fileVersionHistories: Record<string, VersionHistory<{ yoloContent: string | null; jsonContent: string | null; }>> = {};
    const maskVersionHistories: Record<string, VersionHistory<MaskImageAnnotationData>> = {};

    for (const imagePath of imagePaths) {
      // FileOperate History
      const fileRootId = nanoid();
      const fileInitialState = {
        yoloContent: yoloContents[imagePath] || null,
        jsonContent: jsonContents[imagePath] || null,
      };
      fileVersionHistories[imagePath] = {
        root: fileRootId,
        head: fileRootId,
        nodes: {
          [fileRootId]: { id: fileRootId, parentId: null, timestamp: Date.now(), summary: '初始版本', state: fileInitialState }
        },
        redoStack: [], // Bedrock V4.2.2 Change: Initialize redoStack
      };

      // MaskOperate History
      const maskRootId = nanoid();
      const maskInitialState = maskAnnotations[imagePath] || { viewAnnotations: [], apiJson: {} };
      maskVersionHistories[imagePath] = {
        root: maskRootId,
        head: maskRootId,
        nodes: {
          [maskRootId]: { id: maskRootId, parentId: null, timestamp: Date.now(), summary: '初始版本', state: maskInitialState }
        },
        redoStack: [], // Bedrock V4.2.2 Change: Initialize redoStack
      };
    }

    // 5. Update global state for ALL pages
    setFile_yoloFileContents(yoloContents);
    setFile_jsonFileContents(jsonContents);
    setMask_allImageAnnotations(maskAnnotations);
    setMask_classMap(tempMaskClassMap);

    // Reset histories and modification state for ALL pages
    setFile_versionHistory(fileVersionHistories);
    setMask_versionHistory(maskVersionHistories);
    setFile_modifiedFiles({});
    setMask_modifiedFiles({});


    // Bedrock V4 Change: Set the initial file for both pages independently.
    if (firstImageFile) {
      setFile_currentFilePath(firstImageFile.key);
      setMask_currentFilePath(firstImageFile.key);
    } else {
      setFile_currentFilePath(null);
      setMask_currentFilePath(null);
    }

    message.success({ content: '文件夹上传并处理成功！', key: 'global-upload', duration: 3 });
  };

  return (
    <Upload
      directory
      multiple
      showUploadList={false}
      beforeUpload={(_, fileList) => {
        handleGlobalUpload(fileList);
        return false;
      }}
    >
      <Button icon={<UploadOutlined />}>上传文件夹</Button>
    </Upload>
  );
};


// Interface for the ref exposed by GlobalExporter
interface GlobalExporterRef {
  exportAll: () => Promise<void>;
}

/**
 * @description Global exporter component. It intelligently handles data from the current page's real-time state.
 *              This is key to solving a core problem: it reads the active file path and corresponding in-memory
 *              content directly from the `annotationStore`. This ensures that even if the user hasn't triggered a save
 *              by switching images, the "Global Export" captures the latest work.
 *              Bedrock V4.2.3 Change: Wrapped with forwardRef to expose `exportAll` method for AutoSaveManager.
 */
const GlobalExporter = forwardRef<GlobalExporterRef, {}>(({ }, ref) => {
  const {
    fileTree,
    file_yoloFileContents,
    file_jsonFileContents,
    mask_allImageAnnotations,
    mask_classMap,
  } = useModel('annotationStore');

  /**
   * @description Exports all annotation data from both FileOperate and MaskOperate pages into a structured ZIP file.
   */
  const exportAll = async () => {
    if (!fileTree) {
      message.warning("没有可导出的文件。");
      return;
    }
    message.loading({ content: "正在打包所有标注数据...", key: 'global-export', duration: 0 });

    try {
      const zip = new JSZip();

      // This recursive function will build the ZIP structure matching the fileTree
      const addNodeToZip = async (node: FileTreeNode, currentZipFolder: JSZip) => {
        if (!node.isLeaf) { // Directory
          const folder = currentZipFolder.folder(node.title);
          if (folder) {
            for (const child of node.children) {
              await addNodeToZip(child, folder);
            }
          }
        } else { // File (Image)
          const fileNode = node as FileNode;
          const baseName = fileNode.title.substring(0, fileNode.title.lastIndexOf('.'));

          // 1. Add image file to its folder
          currentZipFolder.file(fileNode.title, fileNode.file);

          // 2. Handle FileOperate YOLO (.txt) export
          const yoloContent = file_yoloFileContents[fileNode.key] || "";
          const standardYoloContent = (yoloContent).split('\n').map(line => {
            if (!line.trim()) return '';
            const parts = line.split(' ');
            return parts.length >= 6 ? parts.slice(1).join(' ') : (parts.length === 5 ? line : '');
          }).filter(Boolean).join('\n');
          currentZipFolder.file(`${baseName}.txt`, standardYoloContent);

          // 3. Handle both FileOperate and MaskOperate JSON export
          const fileOperateJsonContent = file_jsonFileContents[fileNode.key] || "{}";

          const maskAnnotationData = mask_allImageAnnotations[fileNode.key];
          let maskJsonContent = "{}";
          if (maskAnnotationData) {
            const finalApiJson = convertApiToView(maskAnnotationData.apiJson, mask_classMap, 2);
            // IMPORTANT: Preserve original, non-convertible data like netlists
            const fullApiJson = { ...maskAnnotationData.apiJson, ...finalApiJson };
            maskJsonContent = JSON.stringify(fullApiJson, null, 2);
          }

          // Since both might generate a .json, we must put them in separate folders
          const jsonFolder = zip.folder('json');
          jsonFolder?.file(`${baseName}.json`, fileOperateJsonContent);

          const wireFolder = zip.folder('wire');
          wireFolder?.file(`${baseName}.json`, maskJsonContent);
        }
      };

      await addNodeToZip(fileTree, zip);

      const zipContent = await zip.generateAsync({ type: 'blob' });
      saveAs(zipContent, 'global_annotations_export.zip');
      message.success({ content: '所有数据已成功导出！', key: 'global-export', duration: 3 });

    } catch (error: any) {
      console.error("全局导出失败:", error);
      message.error({ content: `导出失败: ${error.message}`, key: 'global-export', duration: 3 });
      throw error; // Re-throw to allow AutoSaveManager to catch
    }
  };

  // Expose the exportAll function via ref
  useImperativeHandle(ref, () => ({
    exportAll,
  }));

  return (
    <Tooltip title="导出所有页面的标注数据">
      <Button type="primary" icon={<FileZipOutlined />} onClick={exportAll} ghost>
        全局导出
      </Button>
    </Tooltip>
  );
});

/**
 * @description Manages automatic global exports at a defined interval.
 * Bedrock V4.2.3 Change: New component for periodic auto-save.
 */
const AutoSaveManager: React.FC = () => {
  const globalExporterRef = useRef<GlobalExporterRef>(null);
  const isAutoExportingRef = useRef(false); // To prevent concurrent auto-exports

  // Configurable interval: 10 minutes
  const AUTO_SAVE_INTERVAL_MS = 10 * 60 * 1000;

  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (globalExporterRef.current && !isAutoExportingRef.current) {
        isAutoExportingRef.current = true;

        // Show silent loading message
        const hideLoading = message.loading({ content: '正在自动导出数据...', key: 'auto-export', duration: 0 });

        try {
          await globalExporterRef.current.exportAll(); // Call the exposed export method
          message.success({ content: '自动导出成功！', key: 'auto-export', duration: 2 });
        } catch (error) {
          // Error already logged by GlobalExporter, just show a message
          message.error({ content: `自动导出失败！`, key: 'auto-export', duration: 3 });
        } finally {
          hideLoading(); // Dismiss loading message
          isAutoExportingRef.current = false;
        }
      }
    }, AUTO_SAVE_INTERVAL_MS);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, []); // Empty dependency array means this effect runs once on mount

  return (
    // Render the actual GlobalExporter component, passing the ref
    <GlobalExporter ref={globalExporterRef} />
  );
};


// 语言切换器组件
const LanguageSwitcher: React.FC = () => {
  const { initialState, setInitialState } = useModel('@@initialState');
  const currentLanguage = initialState?.language || 'en';
  const toggleLanguage = () => {
    const newLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    localStorage.setItem('language', newLanguage);
    setInitialState((prevState) => ({ ...prevState, language: newLanguage }));
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: newLanguage } }));
  };
  return (
    <Button type="primary" icon={<GlobalOutlined />} onClick={toggleLanguage}>
      {currentLanguage === 'zh' ? '中文' : 'EN'}
    </Button>
  );
};


/** @see  https://umijs.org/zh-CN/plugins/plugin-initial-state */
export async function getInitialState(): Promise<{
  currentUser?: API.LoginUserVO;
  language?: string;
}> {
  const savedLanguage = localStorage.getItem('language') || 'en';
  const initialState: { currentUser?: API.LoginUserVO, language?: string } = { currentUser: undefined, language: savedLanguage };

  if (history.location.pathname !== loginPath) {
    try {
      const res = await getLoginUserUsingGet();
      initialState.currentUser = res.data;
    } catch (error) {
      history.push(loginPath);
    }
  }
  return initialState;
}

// UmiJS 运行时布局配置
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    rightContentRender: () => (
      <Space size="middle">
        <GlobalUploader />
        <AutoSaveManager /> {/* Use the new AutoSaveManager component */}
        <LanguageSwitcher />
        <AvatarDropdown />
      </Space>
    ),
    footerRender: () => <Footer />,
    waterMarkProps: {
      content: initialState?.currentUser?.userName,
    },
    menuHeaderRender: undefined,
    ...defaultSettings,
  };
};

export const request = requestConfig;

window.appLanguage = {
  getCurrentLanguage: () => localStorage.getItem('language') || 'en',
  subscribeToLanguageChange: (callback) => {
    const handler = (event: any) => { callback(event.detail.language); };
    window.addEventListener('languageChange', handler);
    return () => { window.removeEventListener('languageChange', handler); };
  }
};

declare global {
  interface Window {
    appLanguage: {
      getCurrentLanguage: () => string;
      subscribeToLanguageChange: (cb: (lang: string) => void) => () => void;
    };
  }
}