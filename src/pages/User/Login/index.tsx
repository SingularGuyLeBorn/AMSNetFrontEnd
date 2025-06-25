// src/pages/User/Login/index.tsx
import Footer from '@/components/Footer';
import { userLoginUsingPost } from '@/services/backend/userController';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { useEmotionCss } from '@ant-design/use-emotion-css';
import { Helmet, history, useModel } from '@umijs/max';
import { message, Tabs, Button } from 'antd';
import React, { useState, useEffect } from 'react';
import { Link } from 'umi';
import Settings from '../../../../config/defaultSettings';

// 定义翻译内容
const translations = {
  zh: {
    login: '登录',
    loginSuccess: '登录成功！',
    loginFailed: '登录失败，',
    accountPasswordLogin: '账户密码登录',
    userAccountPlaceholder: '请输入账号',
    userAccountRequired: '账号是必填项！',
    passwordPlaceholder: '请输入密码',
    passwordRequired: '密码是必填项！',
    register: '新用户注册',
    subtitle: '欢迎来到东方理工数字孪生研究院'
  },
  en: {
    login: 'Login',
    loginSuccess: 'Login successful!',
    loginFailed: 'Login failed, ',
    accountPasswordLogin: 'Account Password Login',
    userAccountPlaceholder: 'Please enter your account',
    userAccountRequired: 'Account is required!',
    passwordPlaceholder: 'Please enter your password',
    passwordRequired: 'Password is required!',
    register: 'New User Registration',
    subtitle: 'Welcome to NINGBO INSTITUTE OF DIGITAL TWIN'
  }
};

const Login: React.FC = () => {
  const [type, setType] = useState<string>('account');
  const { initialState, setInitialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setCurrentLang(customEvent.detail.language);
    };

    window.addEventListener('languageChange', handleLanguageChange);
    setCurrentLang(initialState?.language || 'zh');

    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, [initialState?.language]);

  const containerClassName = useEmotionCss(() => {
    return {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'auto',
      backgroundImage:
        "url('https://mdn.alipayobjects.com/yuyan_qk0oxh/afts/img/V-_oS6r-i7wAAAAAAAAAAAAAFl94AQBr')",
      backgroundSize: '100% 100%',
    };
  });

  const handleSubmit = async (values: API.UserLoginRequest) => {
    try {
      // 1. 调用登录接口
      const res = await userLoginUsingPost({ ...values });

      if (res.data) {
        // 2. 【核心修复】登录成功后，将后端返回的 Token 持久化存储
        // 为什么？这是维持登录状态的关键。Token 是后续所有请求的身份凭证。
        // 我假设返回的数据结构中包含 'token' 字段，如果不是，请在此处修改。
        // @ts-ignore
        if (res.data.token) {
          // @ts-ignore
          localStorage.setItem('token', res.data.token);
        }

        const defaultLoginSuccessMessage = t.loginSuccess;
        message.success(defaultLoginSuccessMessage);
        
        // 3. 更新内存中的用户信息，立即生效
        // 为什么？这样无需刷新页面，应用就能立刻进入登录状态。
        await setInitialState((s) => ({
          ...s,
          currentUser: res.data,
        }));
        
        // 4. 跳转到目标页面
        const urlParams = new URL(window.location.href).searchParams;
        history.push(urlParams.get('redirect') || '/');
        return;
      } else {
        // 后端返回成功，但 data 为空，视为登录失败
        throw new Error(res.message || '返回数据异常');
      }

    } catch (error: any) {
      const defaultLoginFailureMessage = `${t.loginFailed}${error.message}`;
      message.error(defaultLoginFailureMessage);
    }
  };

  const toggleLanguage = () => {
    const newLang = currentLang === 'zh' ? 'en' : 'zh';
    setCurrentLang(newLang);
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: newLang } }));
  };

  return (
    <div className={containerClassName}>
      <Helmet>
        <title>
          {t.login} - {Settings.title}
        </title>
      </Helmet>
      
      <Button
        style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}
        onClick={toggleLanguage}
      >
        {currentLang === 'zh' ? 'EN' : '中文'}
      </Button>

      <div style={{ flex: '1', padding: '32px 0' }}>
        <LoginForm
          contentStyle={{ minWidth: 280, maxWidth: '75vw' }}
          logo={<img alt="logo" style={{ height: '100%' }} src="/logo.svg" />}
          title="AMSNet"
          subTitle={t.subtitle}
          initialValues={{ autoLogin: true }}
          onFinish={async (values) => {
            await handleSubmit(values as API.UserLoginRequest);
          }}
        >
          <Tabs
            activeKey={type}
            onChange={setType}
            centered
            items={[{ key: 'account', label: t.accountPasswordLogin }]}
          />
          {type === 'account' && (
            <>
              <ProFormText
                name="userAccount"
                fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
                placeholder={t.userAccountPlaceholder}
                rules={[{ required: true, message: t.userAccountRequired }]}
              />
              <ProFormText.Password
                name="userPassword"
                fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
                placeholder={t.passwordPlaceholder}
                rules={[{ required: true, message: t.passwordRequired }]}
              />
            </>
          )}
          <div style={{ marginBottom: 24, textAlign: 'right' }}>
            <Link to="/user/register">{t.register}</Link>
          </div>
        </LoginForm>
      </div>
      <Footer />
    </div>
    
  );
};

export default Login;