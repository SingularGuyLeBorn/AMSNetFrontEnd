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
import type { ImageAnnotationData } from '@/pages/MaskOperate/constants';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

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
        setFile_currentIndex(0);

        const newAnnotationsData: { [imageName: string]: ImageAnnotationData } = {};
        await Promise.all(
          pngList.map(async (imgFile) => {
              const baseName = getFileNameWithoutExtension(imgFile.name);
              const annotationJsonFile = jsonList.find(f => getFileNameWithoutExtension(f.name) === baseName);
              const annotations: ImageAnnotationData = { jsonAnnotations: [], txtAnnotations: [] };
              if (annotationJsonFile) {
                  try {
                      JSON.parse(await annotationJsonFile.text());
                  } catch (e) {
                      console.error(`解析JSON文件失败 ${imgFile.name}:`, e);
                  }
              }
              newAnnotationsData[imgFile.name] = annotations;
          })
        );
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
 * 全局导出组件
 * @description 负责将两个标注页面的数据从 annotationStore 中聚合，并打包成一个 zip 文件导出。
 * 【核心逻辑】始终以图片列表为准，确保为每张图片都生成对应的标注文件，如果不存在则生成空文件。
 */
const GlobalExporter: React.FC = () => {
    const { file_pngList, file_yoloList, mask_allImageAnnotations } = useModel('annotationStore');

    const handleGlobalExport = async () => {
        if (file_pngList.length === 0) {
            message.warning("没有可导出的文件。");
            return;
        }
        message.loading({ content: "正在打包所有标注数据...", key: 'global-export', duration: 0 });

        try {
            const zip = new JSZip();
            const imagesFolder = zip.folder('images');
            const cpntFolder = zip.folder('cpnt'); // For FileOperate's YOLO .txt
            const wireFolder = zip.folder('wire'); // For MaskOperate's .json

            if (!imagesFolder || !cpntFolder || !wireFolder) {
                 throw new Error("创建ZIP文件夹失败。");
            }

            // 为什么？以图片列表为权威数据源进行遍历，这是确保文件完整性的基石。
            for (const imageFile of file_pngList) {
                const baseName = getFileNameWithoutExtension(imageFile.name);

                // 1. 添加图片文件
                imagesFolder.file(imageFile.name, imageFile);

                // 2. 添加或补全 FileOperate (cpnt) 的 YOLO 文件
                const yoloFile = file_yoloList.find(f => getFileNameWithoutExtension(f.name) === baseName);
                const yoloContent = yoloFile ? await yoloFile.text() : ""; // 如果找不到，则内容为空字符串
                cpntFolder.file(`${baseName}.txt`, yoloContent);

                // 3. 添加或补全 MaskOperate (wire) 的 JSON 文件
                const annotationData = mask_allImageAnnotations[imageFile.name];
                const annotations = annotationData?.jsonAnnotations || [];
                
                const annotationsByCategory: { [key: string]: any[] } = {};
                annotations.forEach(anno => {
                    if (!annotationsByCategory[anno.category]) {
                        annotationsByCategory[anno.category] = [];
                    }
                    const { id, color, category, ...rest } = anno as any; // 去除内部状态
                    annotationsByCategory[category].push(rest);
                });
                
                // 为什么？即使 annotationsByCategory 为空对象，JSON.stringify 也会生成 "{}"，确保了空文件的正确性。
                const jsonContent = JSON.stringify(annotationsByCategory, null, 2);
                wireFolder.file(`${baseName}.json`, jsonContent);
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