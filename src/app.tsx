// FILE: src / app.tsx
import Footer from '@/components/Footer';
import { workspaceService } from "@/models/workspaceService";
import { getLoginUserUsingGet } from '@/services/backend/userController';
import { FolderOpenOutlined, GlobalOutlined, SaveOutlined } from '@ant-design/icons';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import { Button, Modal, Progress, Space, Tooltip, message } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import defaultSettings from '../config/defaultSettings';
import { AvatarDropdown } from './components/RightContent/AvatarDropdown';
import { requestConfig } from './requestConfig';


const loginPath = '/user/login';

/**
 * @description Bedrock Change: 全局工作区加载器，集成全局状态锁
 */
const GlobalUploader: React.FC = () => {
  const { setImageKeys, setFile_currentIndex, setMask_currentIndex, clearAllDirtyData, isAppBusy, setAppBusy } = useModel('annotationStore');
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    if (isAppBusy) {
      message.warning("应用正忙，请稍后再试。");
      return;
    }

    setAppBusy(true); // 加锁
    setIsIndexing(true);
    setProgress({ loaded: 0, total: files.length });
    message.loading({ content: "正在索引文件夹...", key: 'global-upload', duration: 0 });

    try {
      const workspaceInfo = await workspaceService.initializeSourceWorkspace(Array.from(files), (p) => {
        setProgress(p);
      });

      setImageKeys(workspaceInfo.imageKeys);
      setFile_currentIndex(0);
      setMask_currentIndex(0);
      clearAllDirtyData();
      await workspaceService.saveLastIndices({ fileOperateIndex: 0, maskOperateIndex: 0 });

      message.success({ content: `工作区加载成功，共发现 ${workspaceInfo.imageKeys.length} 张图片！`, key: 'global-upload', duration: 3 });

    } catch (error: any) {
      console.error("初始化工作区失败:", error);
      message.error({ content: `初始化工作区失败: ${error.message}`, key: 'global-upload', duration: 5 });
    } finally {
      setIsIndexing(false);
      setAppBusy(false); // 解锁
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
      />
      <Tooltip title="打开一个新的源文件夹">
        <Button icon={<FolderOpenOutlined />} onClick={triggerFileUpload} loading={isIndexing} disabled={isAppBusy}>
          打开文件夹
        </Button>
      </Tooltip>
      <Modal
        title="正在处理文件..."
        open={isIndexing}
        closable={false}
        footer={null}
        centered
      >
        <Progress percent={Math.round((progress.loaded / progress.total) * 100)} />
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>{`正在索引文件: ${progress.loaded} / ${progress.total}`}</p>
      </Modal>
    </>
  );
};


/**
 * @description Bedrock Change: 全局工作区保存器，集成全局状态锁
 */
const WorkspaceSaver: React.FC = () => {
  const { imageKeys, file_dirtyYolo, file_dirtyJson, mask_allImageAnnotations, isAppBusy, setAppBusy } = useModel('annotationStore');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (imageKeys.length === 0) {
      message.warning("没有可保存的工作区。");
      return;
    }
    if (isAppBusy) {
      message.warning("应用正忙，请稍后再试。");
      return;
    }

    setAppBusy(true); // 加锁
    setIsSaving(true);
    message.loading({ content: "正在打包工作区...", key: 'workspace-save', duration: 0 });
    try {
      const success = await workspaceService.saveWorkspace({
        yolo: file_dirtyYolo,
        json: file_dirtyJson,
        mask: mask_allImageAnnotations
      });
      if (success) {
        message.success({ content: '工作区已成功打包为ZIP文件！', key: 'workspace-save', duration: 3 });
      } else {
        message.info({ content: '保存操作已取消。', key: 'workspace-save', duration: 3 });
      }
    } catch (error: any) {
      console.error("保存工作区失败:", error);
      message.error({ content: `保存失败: ${error.message}`, key: 'workspace-save', duration: 5 });
    } finally {
      setIsSaving(false);
      setAppBusy(false); // 解锁
    }
  };

  return (
    <Tooltip title="将所有修改打包成ZIP文件下载">
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={isSaving} disabled={isAppBusy}>
        保存工作区
      </Button>
    </Tooltip>
  );
};


/**
 * @description 语言切换器组件
 */
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
    <Button type="primary" icon={<GlobalOutlined />} onClick={toggleLanguage} ghost>
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

const AppStartupLogic: React.FC = () => {
  const { setImageKeys, setFile_currentIndex, setMask_currentIndex, setAppBusy } = useModel('annotationStore');

  useEffect(() => {
    const tryRestore = async () => {
      setAppBusy(true); // 加锁
      try {
        const restored = await workspaceService.restoreWorkspace();
        if (restored) {
          setImageKeys(restored.imageKeys);
          setFile_currentIndex(restored.lastFileOperateIndex);
          setMask_currentIndex(restored.lastMaskOperateIndex);
          message.success(`已恢复上次的工作区，共 ${restored.imageKeys.length} 张图片。`);
        }
      } catch (e) {
        console.error("恢复工作区失败", e);
        message.error("恢复上次工作区失败。");
      } finally {
        setAppBusy(false); // 解锁
      }
    };
    tryRestore();
  }, [setImageKeys, setFile_currentIndex, setMask_currentIndex, setAppBusy]);

  return null;
}

/**
 * @description UmiJS 运行时布局配置
 */
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    rightContentRender: () => (
      <Space size="middle">
        <GlobalUploader />
        <WorkspaceSaver />
        <LanguageSwitcher />
        <AvatarDropdown />
      </Space>
    ),
    footerRender: () => <Footer />,
    waterMarkProps: {
      content: initialState?.currentUser?.userName,
    },
    // 在布局中插入一个无UI的组件来执行启动逻辑
    childrenRender: (children) => {
      return (
        <>
          <AppStartupLogic />
          {children}
        </>
      )
    },
    menuHeaderRender: undefined,
    ...defaultSettings,
  };
};

export const request = requestConfig;

/**
 * @description 全局语言切换事件系统
 */
window.appLanguage = {
  getCurrentLanguage: () => localStorage.getItem('language') || 'en',
  subscribeToLanguageChange: (callback) => {
    const handler = (event: any) => { callback(event.detail.language); };
    window.addEventListener('languageChange', handler);
    return () => { window.removeEventListener('languageChange', handler); };
  }
};

// Bedrock Change: Type Definitions for File System Access API are kept for potential future use (e.g., in HTTPS environments)
// But the core logic no longer relies on them.
declare global {
  interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: 'file';
    getFile(): Promise<File>;
    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: 'directory';
    getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    keys(): AsyncIterableIterator<string>;
    values(): AsyncIterableIterator<FileSystemHandle>;
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
  }

  interface Window {
    appLanguage: {
      getCurrentLanguage: () => string;
      subscribeToLanguageChange: (cb: (lang: string) => void) => () => void;
    };
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  }

  // Define related types that might be missing
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemCreateWritableOptions {
    keepExistingData?: boolean;
  }

  interface FileSystemGetDirectoryOptions {
    create?: boolean;
  }

  interface FileSystemGetFileOptions {
    create?: boolean;
  }

  interface FileSystemRemoveOptions {
    recursive?: boolean;
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
  }

  interface FileSystemWritableFileStream extends WritableStream {
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
  }
}