// src/app.tsx
import Footer from '@/components/Footer';
import { getLoginUserUsingGet } from '@/services/backend/userController';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import defaultSettings from '../config/defaultSettings';
import { AvatarDropdown } from './components/RightContent/AvatarDropdown';
import { requestConfig } from './requestConfig';
import { Button, Upload, message } from 'antd';
import { GlobalOutlined, UploadOutlined } from '@ant-design/icons';
import React from 'react';
import type { DeviceLabelingState, NetLabelingState, ImageFileInfo, ImageAnnotationData } from '@/models/workSpace';

const loginPath = '/user/login';

// Define the extended InitialState type
export interface InitialState {
  currentUser?: API.LoginUserVO;
  language?: string;
}

// 辅助函数：从文件名中移除扩展名
const getFileNameWithoutExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return fileName;
  return fileName.substring(0, lastDotIndex);
};


/** 全局文件上传组件 */
const GlobalUploader: React.FC = () => {
    const { setDeviceLabelingState, setNetLabelingState } = useModel('fileModel');

    const handleGlobalUpload = async (files: File[]) => {
        message.loading({ content: "Processing folder...", key: 'global-upload' });

        // 1. 为 DeviceLabeling (FileOperate) 准备数据
        const pngList: File[] = files.filter(f => f.type.startsWith('image/')).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
        const yoloList: File[] = files.filter(f => f.name.endsWith('.txt')).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
        const jsonList: File[] = files.filter(f => f.name.endsWith('.json')).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
        
        setDeviceLabelingState({
            pngList,
            yoloList,
            jsonList,
            currentIndex: 0,
        });

        // 2. 为 NetLabeling (MaskOperate) 准备数据 (与 MaskOperate 页面逻辑保持一致)
        const imageInputFiles = files.filter(f => f.type.match(/image\/(jpeg|png|jpg)/i));
        const newImages: ImageFileInfo[] = [];
        const newAnnotationsData: { [imageName: string]: ImageAnnotationData } = {};

        for (const imgFile of imageInputFiles.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
            const imageUrl = URL.createObjectURL(imgFile);
            try {
                const imageInfo = await new Promise<ImageFileInfo>((resolve, reject) => {
                    const imageElement = new Image();
                    imageElement.onload = () => resolve({ name: imgFile.name, url: imageUrl, originalFile: imgFile, width: imageElement.naturalWidth, height: imageElement.naturalHeight });
                    imageElement.onerror = () => reject(new Error(`Cannot load image: ${imgFile.name}`));
                    imageElement.src = imageUrl;
                });
                newImages.push(imageInfo);
                newAnnotationsData[imageInfo.name] = { jsonAnnotations: [], txtAnnotations: [] };
            } catch (imgError) {
                message.error((imgError as Error).message);
            }
        }

        setNetLabelingState({
            images: newImages,
            currentImageIndex: newImages.length > 0 ? 0 : -1,
            allImageAnnotations: newAnnotationsData,
        });

        message.success({ content: 'Folder uploaded and processed successfully!', key: 'global-upload', duration: 3 });
    };

    return (
        <Upload
            directory
            multiple
            showUploadList={false}
            beforeUpload={() => false} // 阻止自动上传
            onChange={({ fileList }) => handleGlobalUpload(fileList.map(f => f.originFileObj as File))}
        >
            <Button
                icon={<UploadOutlined />}
                type="primary"
                ghost
                style={{
                  position: 'fixed',
                  top: '12px',
                  right: '220px',
                  zIndex: 1000,
                }}
            >
                Upload Folder
            </Button>
        </Upload>
    );
};


/** @see  https://umijs.org/zh-CN/plugins/plugin-initial-state */
export async function getInitialState(): Promise<InitialState> {
  // Get saved language from localStorage or default to 'en'
  const savedLanguage = localStorage.getItem('language') || 'en';

  const initialState: InitialState = {
    currentUser: undefined,
    language: savedLanguage,
  };

  // 如果不是登录页面，执行
  const { location } = history;
  if (location.pathname !== loginPath) {
    try {
      const res = await getLoginUserUsingGet();
      initialState.currentUser = res.data;
    } catch (error: any) {
      // 如果未登录
    }
  }
  return initialState;
}

// Language switcher component with fixed positioning
const LanguageSwitcher: React.FC = () => {
  const { initialState, setInitialState } = useModel('@@initialState');
  const currentLanguage = initialState?.language || 'en'; // Default to English

  const toggleLanguage = () => {
    const newLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    // Save to localStorage for persistence
    localStorage.setItem('language', newLanguage);

    // Update global state
    setInitialState((prevState) => ({
      ...prevState,
      language: newLanguage,
    }));

    // Dispatch a custom event that child components can listen for
    window.dispatchEvent(
        new CustomEvent('languageChange', { detail: { language: newLanguage } })
    );
  };

  return (
      <div style={{
        position: 'fixed',
        top: '12px',
        right: '135px',
        zIndex: 1000,
      }}>
        <Button
            type="primary"
            icon={<GlobalOutlined />}
            onClick={toggleLanguage}
        >
          {currentLanguage === 'zh' ? '中文' : 'EN'}
        </Button>
      </div>
  );
};

// ProLayout 支持的api https://procomponents.ant.design/components/layout
// @ts-ignore
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    avatarProps: {
      render: () => {
        return <AvatarDropdown />;
      },
    },
    waterMarkProps: {
      content: initialState?.currentUser?.userName,
    },
    footerRender: () => <Footer />,
    menuHeaderRender: undefined,
    ...defaultSettings,
    childrenRender: (children) => (
        <>
          {children}
          {/* 全局上传按钮 */}
          {initialState?.currentUser && <GlobalUploader />}
          {/* 语言切换按钮 */}
          <LanguageSwitcher />
        </>
    )
  };
};

/**
 * @name request 配置，可以配置错误处理
 * 它基于 axios 和 ahooks 的 useRequest 提供了一套统一的网络请求和错误处理方案。
 * @doc https://umijs.org/docs/max/request#配置
 */
export const request = requestConfig;

// 创建一个全局的语言变量工具，用于非React组件获取语言设置
window.appLanguage = {
  // 获取当前语言
  getCurrentLanguage: () => {
    return localStorage.getItem('language') || 'en';
  },

  // 订阅语言变化
  subscribeToLanguageChange: (callback) => {
    const handler = (event: any) => {
      callback(event.detail.language);
    };
    window.addEventListener('languageChange', handler);

    // 返回取消订阅的函数
    return () => {
      window.removeEventListener('languageChange', handler);
    };
  }
};

// 在全局范围内声明类型
declare global {
  interface Window {
    appLanguage: {
      getCurrentLanguage: () => string;
      subscribeToLanguageChange: (cb: (lang: string) => void) => () => void;
    };
  }
}