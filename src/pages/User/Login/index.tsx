import Footer from '@/components/Footer';
import { userLoginUsingPost } from '@/services/backend/userController';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { useEmotionCss } from '@ant-design/use-emotion-css';
import { Helmet, history, useModel } from '@umijs/max';
import { message, Tabs } from 'antd';
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
        subtitle: '快速开发属于自己的前端项目'
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
        subtitle: 'Quickly develop your own front-end project'
    }
};

const Login: React.FC = () => {
    const [type, setType] = useState<string>('account');
    const { initialState, setInitialState } = useModel('@@initialState');
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

        // message.info(currentLang === 'zh' ? '已切换为中文' : 'Language changed to English');

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
            // 登录
            const res = await userLoginUsingPost({
                ...values,
            });

            const defaultLoginSuccessMessage = t.loginSuccess;
            message.success(defaultLoginSuccessMessage);
            // 保存已登录用户信息
            setInitialState({
                ...initialState,
                currentUser: res.data,
            });
            const urlParams = new URL(window.location.href).searchParams;
            history.push(urlParams.get('redirect') || '/');
            return;
        } catch (error: any) {
            const defaultLoginFailureMessage = `${t.loginFailed}${error.message}`;
            message.error(defaultLoginFailureMessage);
        }
    };

    return (
        <div className={containerClassName}>
            <Helmet>
                <title>
                    {t.login} - {Settings.title}
                </title>
            </Helmet>
            <div
                style={{
                    flex: '1',
                    padding: '32px 0',
                }}
            >
                <LoginForm
                    contentStyle={{
                        minWidth: 280,
                        maxWidth: '75vw',
                    }}
                    logo={<img alt="logo" style={{ height: '100%' }} src="/logo.svg" />}
                    title="AMSNet"
                    subTitle={t.subtitle}
                    initialValues={{
                        autoLogin: true,
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
                                label: t.accountPasswordLogin,
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
                                placeholder={t.userAccountPlaceholder}
                                rules={[
                                    {
                                        required: true,
                                        message: t.userAccountRequired,
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
                        </>
                    )}

                    <div
                        style={{
                            marginBottom: 24,
                            textAlign: 'right',
                        }}
                    >
                        <Link to="/user/register">{t.register}</Link>
                    </div>
                </LoginForm>
            </div>
            <Footer />
        </div>
    );
};

export default Login;
