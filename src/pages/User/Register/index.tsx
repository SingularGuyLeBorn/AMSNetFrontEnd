import Footer from '@/components/Footer';
import { userRegisterUsingPost } from '@/services/backend/userController';
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
    register: '注册',
    registerSuccess: '注册成功！',
    registerFailure: '注册失败，',
    fishFactoryRecruitment: 'AMSNet标注平台注册页面',
    efficientRecruitment: '高效标注',
    registerButton: '注册',
    newUserRegister: '新用户注册',
    accountPlaceholder: '请输入账号',
    accountRequired: '账号是必填项！',
    passwordPlaceholder: '请输入密码',
    passwordRequired: '密码是必填项！',
    confirmPasswordPlaceholder: '请再次确认密码',
    confirmPasswordRequired: '确认密码是必填项！',
    passwordMismatch: '二次输入的密码不一致',
    existingUserLogin: '老用户登录'
  },
  en: {
    register: 'Register',
    registerSuccess: 'Registration successful!',
    registerFailure: 'Registration failed, ',
    fishFactoryRecruitment: 'AMSNet Label Platform Registration Page',
    efficientRecruitment: 'Efficient Label',
    registerButton: 'Register',
    newUserRegister: 'New User Registration',
    accountPlaceholder: 'Please enter account',
    accountRequired: 'Account is required!',
    passwordPlaceholder: 'Please enter password',
    passwordRequired: 'Password is required!',
    confirmPasswordPlaceholder: 'Please confirm password',
    confirmPasswordRequired: 'Confirm password is required!',
    passwordMismatch: 'Passwords do not match',
    existingUserLogin: 'Existing user login'
  }
};

/**
 * 用户注册页面
 * @constructor
 */
const UserRegisterPage: React.FC = () => {
  const [type, setType] = useState<string>('account');
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  // Update language when global language changes
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

  /**
   * 提交注册
   * @param values
   */
  const handleSubmit = async (values: API.UserRegisterRequest) => {
    const { userPassword, checkPassword } = values;
    if (userPassword !== checkPassword) {
      message.error(t.passwordMismatch);
      return;
    }

    try {
      await userRegisterUsingPost({ ...values });
      message.success(t.registerSuccess);
      history.push('/user/login');
    } catch (error: any) {
      message.error(`${t.registerFailure}${error.message}`);
    }
  };

  const toggleLanguage = () => {
    setCurrentLang(currentLang === 'zh' ? 'en' : 'zh');
    // Dispatch custom event to notify other parts of the app
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { language: currentLang === 'zh' ? 'en' : 'zh' } }));
  };

  return (
    <div className={containerClassName}>
      <Helmet>
        <title>{t.register} - {Settings.title}</title>
      </Helmet>

      {/* Language Toggle Button */}
      <Button
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          fontSize: '16px',
          zIndex: 10,
        }}
        onClick={toggleLanguage}
      >
        {currentLang === 'zh' ? 'EN' : '中文'}
      </Button>

      <div style={{ flex: '1', padding: '32px 0' }}>
        <LoginForm
          contentStyle={{
            minWidth: 280,
            maxWidth: '75vw',
          }}
          logo={<img alt="logo" style={{ height: '100%' }} src="/logo.svg" />}
          title={t.fishFactoryRecruitment}
          subTitle={t.efficientRecruitment}
          initialValues={{
            autoLogin: true,
          }}
          submitter={{
            searchConfig: {
              submitText: t.registerButton,
            },
          }}
          onFinish={async (values) => {
            await handleSubmit(values as API.UserLoginRequest);
          }}
        >
          <Tabs
            activeKey={type}
            onChange={setType}
            centered
            items={[
              {
                key: 'account',
                label: t.newUserRegister,
              },
            ]}
          />
          {type === 'account' && (
            <>
              <ProFormText
                name="userAccount"
                fieldProps={{
                  size: 'large',
                  prefix: <UserOutlined />,
                }}
                placeholder={t.accountPlaceholder}
                rules={[
                  {
                    required: true,
                    message: t.accountRequired,
                  },
                ]}
              />
              <ProFormText.Password
                name="userPassword"
                fieldProps={{
                  size: 'large',
                  prefix: <LockOutlined />,
                }}
                placeholder={t.passwordPlaceholder}
                rules={[
                  {
                    required: true,
                    message: t.passwordRequired,
                  },
                ]}
              />
              <ProFormText.Password
                name="checkPassword"
                fieldProps={{
                  size: 'large',
                  prefix: <LockOutlined />,
                }}
                placeholder={t.confirmPasswordPlaceholder}
                rules={[
                  {
                    required: true,
                    message: t.confirmPasswordRequired,
                  },
                ]}
              />
            </>
          )}

          <div
            style={{
              marginBottom: 24,
              textAlign: 'right',
            }}
          >
            <Link to="/user/login">{t.existingUserLogin}</Link>
          </div>
        </LoginForm>
      </div>
      <Footer />
    </div>
  );
};

export default UserRegisterPage;
