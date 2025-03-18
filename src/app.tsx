import Footer from '@/components/Footer';
import { getLoginUserUsingGet } from '@/services/backend/userController';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history, useModel } from '@umijs/max';
import defaultSettings from '../config/defaultSettings';
import { AvatarDropdown } from './components/RightContent/AvatarDropdown';
import { requestConfig } from './requestConfig';
import FloatWindow from "@/pages/FloatWindow";
import { Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import React from 'react';

const loginPath = '/user/login';

// Define the extended InitialState type
export interface InitialState {
  currentUser?: API.LoginUserVO;
  language?: string;
}

/**
 * @see  https://umijs.org/zh-CN/plugins/plugin-initial-state
 * */
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
    // 自定义 403 页面
    // unAccessible: <div>unAccessible</div>,
    ...defaultSettings,

    // 核心修改点：通过 childrenRender 注入悬浮窗和语言切换按钮
    childrenRender: (children) => (
        <>
          {/* 主内容区域 */}
          {children}

          {/* 全局悬浮窗（固定在右下角） */}
          <FloatWindow />

          {/* 语言切换按钮（固定在右上角） */}
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
    const handler = (event) => {
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
