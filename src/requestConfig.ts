// src/requestConfig.ts
import { BACKEND_HOST_LOCAL, BACKEND_HOST_PROD } from '@/constants';
import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
// 【核心修正】确保从 @umijs/max 正确导入 history 对象
import { history } from '@umijs/max';
import { message } from 'antd';

// 与后端约定的响应数据格式
interface ResponseStructure {
  success: boolean;
  data: any;
  errorCode?: number;
  errorMessage?: string;
  code?: number; // 兼容新的code字段
  message?: string; // 兼容新的message字段
}

const isDev = process.env.NODE_ENV === 'development';

/**
 * @name 错误处理
 * pro 自带的错误处理， 可以在这里做自己的改动
 * @doc https://umijs.org/docs/max/request#配置
 */
export const requestConfig: RequestConfig = {
  baseURL: isDev ? BACKEND_HOST_LOCAL : BACKEND_HOST_PROD,
  withCredentials: true,

  // 请求拦截器
  requestInterceptors: [
    (config: RequestOptions) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
      return config;
    },
  ],

  // 响应拦截器
  responseInterceptors: [
    (response) => {
      const { data } = response as unknown as { data: ResponseStructure };
      
      if (!data) {
        message.error('服务异常，无返回值');
        throw new Error('服务异常，无返回值');
      }
      
      const code = data.code;
      
      if (code !== 0 && code !== undefined) {
         if (code === 40100 || code === 40101) {
            if (!location.pathname.includes('/user/login')) {
                message.error('登录已过期，请重新登录');
                // 【核心修正】使用从 @umijs/max 导入的 history 对象进行路由跳转
                // 为什么？这是 UmiJS 在非 React 组件中进行编程式导航的标准方式。
                // 它确保了我们使用的是应用统一的路由实例。
                history.push(`/user/login?redirect=${window.location.href}`);
            }
         } else {
            message.error(data.message || '服务器错误');
         }
         throw new Error(data.message || '服务器错误');
      }
      
      return response;
    },
  ],
};