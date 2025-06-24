// src/app.tsx (已修正并与 annotationStore 同步)
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
// 从 MaskOperate 的常量文件中导入类型
import type { ImageAnnotationData, UndoOperation as MaskUndoOperation } from '@/pages/MaskOperate/constants';


const loginPath = '/user/login';

// 定义扩展的 InitialState 类型
export interface InitialState {
  currentUser?: API.LoginUserVO;
  language?: string;
}

/** 全局文件上传组件 */
const GlobalUploader: React.FC = () => {
    // 【核心修正】只从 annotationStore 获取存在的 setter 函数
    const {
      setFile_pngList, 
      setFile_yoloList, 
      setFile_jsonList, 
      setFile_currentIndex,
      setMask_allImageAnnotations,
      setMask_operationHistory,
      setMask_redoHistory,
      setMask_categories,
      setMask_categoryColors,
    } = useModel('annotationStore');

    const handleGlobalUpload = async (files: File[]) => {
        if (!files || files.length === 0) {
            message.warning("No files selected in the folder.");
            return;
        }
        message.loading({ content: "Processing folder...", key: 'global-upload', duration: 0 });

        const compareFn = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });

        // --- 1. 为 FileOperate (DeviceLabeling) 设置数据 ---
        const pngList: File[] = files.filter(f => f.type.startsWith('image/')).sort(compareFn);
        const yoloList: File[] = files.filter(f => f.name.endsWith('.txt')).sort(compareFn);
        const jsonList: File[] = files.filter(f => f.name.endsWith('.json')).sort(compareFn);

        setFile_pngList(pngList);
        setFile_yoloList(yoloList);
        setFile_jsonList(jsonList);
        setFile_currentIndex(0); // 两个组件共享此索引，设为0

        // --- 2. 为 MaskOperate (NetLabeling) 设置数据 ---
        const newAnnotationsData: { [imageName: string]: ImageAnnotationData } = {};
        
        // 并行处理所有图片标注文件的解析
        await Promise.all(
          pngList.map(async (imgFile) => {
              const baseName = imgFile.name.substring(0, imgFile.name.lastIndexOf('.')) || imgFile.name;
              const annotationJsonFile = jsonList.find(f => (f.name.substring(0, f.name.lastIndexOf('.')) || f.name) === baseName);
              
              const annotations: ImageAnnotationData = { jsonAnnotations: [], txtAnnotations: [] };
              if (annotationJsonFile) {
                  try {
                      const rawJson = JSON.parse(await annotationJsonFile.text());
                      if(typeof rawJson === 'object' && rawJson !== null) {
                        // 此处应有更详细的解析逻辑，但为简化，我们仅创建空结构
                        // 实际项目中，您可能需要遍历 rawJson 来填充 jsonAnnotations
                      }
                  } catch (e) {
                      console.error(`Error parsing JSON for ${imgFile.name}:`, e);
                  }
              }
              newAnnotationsData[imgFile.name] = annotations;
          })
        );
        
        setMask_allImageAnnotations(newAnnotationsData);
        
        // 重置 MaskOperate 的历史记录
        setMask_operationHistory({});
        setMask_redoHistory({});
        
        // 可以在这里重置或更新类别信息
        // setMask_categories([...]);
        // setMask_categoryColors({...});
        
        message.success({ content: 'Folder uploaded and processed successfully!', key: 'global-upload', duration: 3 });
    };

    return (
        <Upload
            directory
            multiple
            showUploadList={false}
            beforeUpload={(_, fileList) => {
                handleGlobalUpload(fileList);
                return false; // 阻止自动上传
            }}
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
  const savedLanguage = localStorage.getItem('language') || 'en';
  const initialState: InitialState = { currentUser: undefined, language: savedLanguage };

  const { location } = history;
  if (location.pathname !== loginPath) {
    try {
      const res = await getLoginUserUsingGet();
      initialState.currentUser = res.data;
    } catch (error: any) {
      // no-op
    }
  }
  return initialState;
}

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
      <div style={{ position: 'fixed', top: '12px', right: '135px', zIndex: 1000 }}>
        <Button type="primary" icon={<GlobalOutlined />} onClick={toggleLanguage}>
          {currentLanguage === 'zh' ? '中文' : 'EN'}
        </Button>
      </div>
  );
};

// @ts-ignore
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    avatarProps: {
      render: () => <AvatarDropdown />,
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
          {initialState?.currentUser && <GlobalUploader />}
          <LanguageSwitcher />
        </>
    )
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