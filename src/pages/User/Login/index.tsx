// src/pages/User/Login/index.tsx
import Footer from '@/components/Footer';
// import { userLoginUsingPost } from '@/services/backend/userController'; // 导入的登录接口可以注释掉或移除
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
    // --- 修改开始 ---
    // 绕过实际的登录接口调用，直接模拟登录成功
    const mockLoginSuccess = async () => {
      // 这里可以定义一个模拟的用户信息，或者使用用户输入的值
      // 为了简单起见，我们直接创建一个模拟用户对象
      const mockCurrentUser = {
        userAccount: values.userAccount || 'mockUser', // 使用用户输入的账号，如果为空则使用默认值
        userName: 'Mock User',
        userRole: 'user', // 或者 'admin'，取决于你希望模拟的角色
        // ... 其他你可能需要的模拟用户信息字段
      };
      
      // 模拟设置 Token
      const mockToken = 'mock-login-token-12345';
      localStorage.setItem('token', mockToken);

      // 模拟登录成功消息
      const defaultLoginSuccessMessage = t.loginSuccess;
      message.success(defaultLoginSuccessMessage);

      // 更新内存中的用户信息
      await setInitialState((s) => ({
        ...s,
        currentUser: mockCurrentUser,
      }));

      // 跳转到目标页面
      const urlParams = new URL(window.location.href).searchParams;
      history.push(urlParams.get('redirect') || '/');
    };

    await mockLoginSuccess();
    // --- 修改结束 ---

    /*
    // 原来的登录逻辑，已被注释掉：
    try {
      const res = await userLoginUsingPost({ ...values });

      if (res.data) {
        // @ts-ignore
        if (res.data.token) {
          // @ts-ignore
          localStorage.setItem('token', res.data.token);
        }

        const defaultLoginSuccessMessage = t.loginSuccess;
        message.success(defaultLoginSuccessMessage);
        
        await setInitialState((s) => ({
          ...s,
          currentUser: res.data,
        }));
        
        const urlParams = new URL(window.location.href).searchParams;
        history.push(urlParams.get('redirect') || '/');
        return;
      } else {
        throw new Error(res.message || '返回数据异常');
      }

    } catch (error: any) {
      const defaultLoginFailureMessage = `${t.loginFailed}${error.message}`;
      message.error(defaultLoginFailureMessage);
    }
    */
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