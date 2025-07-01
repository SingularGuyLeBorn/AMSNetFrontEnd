// src/app.tsx
import Footer from '@/components/Footer';
import { getLoginUserUsingGet } from '@/services/backend/userController';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import defaultSettings from '../config/defaultSettings';
import { AvatarDropdown } from './components/RightContent/AvatarDropdown';
import { requestConfig } from './requestConfig';
import { Button, Upload, message, Space, Tooltip } from 'antd';
import { GlobalOutlined, UploadOutlined, FileZipOutlined } from '@ant-design/icons';
import React from 'react';
import type { ImageAnnotationData as MaskImageAnnotationData, ApiResponse as MaskApiResponse, ViewAnnotation } from '@/pages/MaskOperate/constants';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
// [FIX]: Import helper functions with named imports from their respective modules.
import { parseJsonContent, stringifyJsonContent } from "@/pages/FileOperate/index";
import { convertViewToApi } from "@/pages/MaskOperate/index";

const loginPath = '/user/login';

// 辅助函数：获取不带扩展名的文件名
const getFileNameWithoutExtension = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) return fileName;
    return fileName.substring(0, lastDotIndex);
};

// 全局文件上传组件
const GlobalUploader: React.FC = () => {
    const {
      setFile_pngList,
      setFile_yoloList,
      setFile_jsonList,
      setFile_currentIndex,
      setFile_currentYoloContent,
      setFile_currentJsonContent,
      setMask_allImageAnnotations,
      setMask_operationHistory,
      setMask_redoHistory,
      setMask_currentIndex,
    } = useModel('annotationStore');

    const handleGlobalUpload = async (files: File[]) => {
        if (!files || files.length === 0) {
            message.warning("文件夹中未选择任何文件。");
            return;
        }
        message.loading({ content: "正在处理文件夹...", key: 'global-upload', duration: 0 });

        const compareFn = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });

        const pngList: File[] = files.filter(f => f.type.startsWith('image/')).sort(compareFn);
        const yoloList: File[] = files.filter(f => f.name.endsWith('.txt')).sort(compareFn);
        const jsonList: File[] = files.filter(f => f.name.endsWith('.json')).sort(compareFn);

        setFile_pngList(pngList);
        setFile_yoloList(yoloList);
        setFile_jsonList(jsonList);
        
        // Reset FileOperate state
        setFile_currentIndex(0);
        const firstYoloFile = yoloList.find(f => getFileNameWithoutExtension(f.name) === getFileNameWithoutExtension(pngList[0]?.name));
        const firstJsonFile = jsonList.find(f => getFileNameWithoutExtension(f.name) === getFileNameWithoutExtension(pngList[0]?.name));
        setFile_currentYoloContent(firstYoloFile ? await firstYoloFile.text() : '');
        setFile_currentJsonContent(firstJsonFile ? await firstJsonFile.text() : '{}');


        // Reset MaskOperate state
        const newAnnotationsData: { [imageName: string]: MaskImageAnnotationData } = {};
        for (const imgFile of pngList) {
          const baseName = getFileNameWithoutExtension(imgFile.name);
          // Bedrock: Assume JSON from `wire` folder is for MaskOperate
          const annotationJsonFile = jsonList.find(f => getFileNameWithoutExtension(f.name) === baseName);
          let apiJson: MaskApiResponse = {};
          if (annotationJsonFile) {
              try {
                  apiJson = JSON.parse(await annotationJsonFile.text());
              } catch (e) {
                  console.error(`解析MaskOperate的JSON文件失败 ${imgFile.name}:`, e);
              }
          }
          newAnnotationsData[imgFile.name] = { viewAnnotations: [], apiJson };
        }
        setMask_allImageAnnotations(newAnnotationsData);
        setMask_operationHistory({});
        setMask_redoHistory({});
        setMask_currentIndex(0);

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

/**
 * @description 全局导出组件，现在能够智能处理当前页面的实时编辑数据。
 * @why 这是解决核心问题的关键。此组件现在直接从 `annotationStore` 读取当前激活的索引和对应的内存中的（可能未保存的）内容。
 *      这确保了即使用户没有通过切换图片等操作触发保存，"全局导出"也能获取到最新的工作成果。
 */
const GlobalExporter: React.FC = () => {
    const { 
        file_pngList, 
        file_yoloList, 
        file_jsonList, 
        file_currentIndex,
        file_currentYoloContent,
        file_currentJsonContent,
        mask_allImageAnnotations,
    } = useModel('annotationStore');

    const handleGlobalExport = async () => {
        if (file_pngList.length === 0) {
            message.warning("没有可导出的文件。");
            return;
        }
        message.loading({ content: "正在打包所有标注数据...", key: 'global-export', duration: 0 });

        try {
            const zip = new JSZip();
            const imagesFolder = zip.folder('images');
            const cpntFolder = zip.folder('yolo'); // For FileOperate's YOLO .txt
            const jsonFolder = zip.folder('json'); // For FileOperate's JSON
            const wireFolder = zip.folder('wire'); // For MaskOperate's .json

            if (!imagesFolder || !cpntFolder || !jsonFolder || !wireFolder) {
                 throw new Error("创建ZIP文件夹失败。");
            }

            for (let i = 0; i < file_pngList.length; i++) {
                const imageFile = file_pngList[i];
                const baseName = getFileNameWithoutExtension(imageFile.name);

                // 1. Add image file
                imagesFolder.file(imageFile.name, imageFile);

                // 2. Add or supplement FileOperate's YOLO (.txt) and JSON (.json) files
                let yoloContentToExport: string = '';
                let jsonContentToExport: string = '{}';

                if (i === file_currentIndex) {
                    // If it's the currently active file in FileOperate, use the live data from the store.
                    yoloContentToExport = file_currentYoloContent || '';
                    jsonContentToExport = stringifyJsonContent(parseJsonContent(file_currentJsonContent));
                } else {
                    // Otherwise, find the corresponding file in the list.
                    const yoloFile = file_yoloList.find(f => getFileNameWithoutExtension(f.name) === baseName);
                    if (yoloFile) {
                        yoloContentToExport = await yoloFile.text();
                    }
                    
                    const jsonFile = file_jsonList.find(f => getFileNameWithoutExtension(f.name) === baseName);
                    if (jsonFile) {
                        jsonContentToExport = stringifyJsonContent(parseJsonContent(await jsonFile.text()));
                    }
                }

                // Convert internal YOLO format to standard YOLOv5 format for export
                const standardYoloContent = (yoloContentToExport || "").split('\n').map(line => {
                    if (!line.trim()) return '';
                    const parts = line.split(' ');
                    // Standard format is `class_idx x_center y_center width height`
                    return parts.length >= 6 ? parts.slice(1).join(' ') : (parts.length === 5 ? line : '');
                }).filter(Boolean).join('\n');
                
                cpntFolder.file(`${baseName}.txt`, standardYoloContent);
                jsonFolder.file(`${baseName}.json`, jsonContentToExport);

                // 3. Add or supplement MaskOperate's (wire) JSON file
                // The store `mask_allImageAnnotations` is assumed to be the single source of truth,
                // updated by the MaskOperate component upon user actions (e.g., mouse-up, navigation).
                const annotationData = mask_allImageAnnotations[imageFile.name];
                const finalApiJson = annotationData?.apiJson || convertViewToApi(annotationData?.viewAnnotations || []);
                const wireJsonContent = JSON.stringify(finalApiJson, null, 2);
                wireFolder.file(`${baseName}.json`, wireJsonContent);
            }

            const zipContent = await zip.generateAsync({ type: 'blob' });
            saveAs(zipContent, 'global_annotations_export.zip');
            message.success({ content: '所有数据已成功导出！', key: 'global-export', duration: 3 });

        } catch (error: any) {
            console.error("全局导出失败:", error);
            message.error({ content: `导出失败: ${error.message}`, key: 'global-export', duration: 3 });
        }
    };

    return (
        <Tooltip title="导出所有页面的标注数据">
            <Button type="primary" icon={<FileZipOutlined />} onClick={handleGlobalExport} ghost>
                全局导出
            </Button>
        </Tooltip>
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
            <GlobalExporter />
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
// END OF FILE src/app.tsx