import { userLogoutUsingPost } from '@/services/backend/userController';
import { LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { history, useModel } from '@umijs/max';
import { Avatar, Button, Space } from 'antd';
import { stringify } from 'querystring';
import type { MenuInfo } from 'rc-menu/lib/interface';
import React, { useCallback, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'umi';
import HeaderDropdown from '../HeaderDropdown';

// 定义翻译内容
const translations = {
    zh: {
        login: '登录',
        userCenter: '个人中心',
        userSettings: '个人设置',
        logout: '退出登录',
        noName: '无名'
    },
    en: {
        login: 'Login',
        userCenter: 'User Center',
        userSettings: 'User Settings',
        logout: 'Logout',
        noName: 'No Name'
    }
};

export type GlobalHeaderRightProps = {
    menu?: boolean;
};

export const AvatarDropdown: React.FC<GlobalHeaderRightProps> = ({ menu }) => {
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

    /**
     * 退出登录，并且将当前的 url 保存
     */
    const loginOut = async () => {
        await userLogoutUsingPost();
        const { search, pathname } = window.location;
        const urlParams = new URL(window.location.href).searchParams;
        /** 此方法会跳转到 redirect 参数所在的位置 */
        const redirect = urlParams.get('redirect');
        // Note: There may be security issues, please note
        if (window.location.pathname !== '/user/login' && !redirect) {
            history.replace({
                pathname: '/user/login',
                search: stringify({
                    redirect: pathname + search,
                }),
            });
        }
    };

    const onMenuClick = useCallback(
        (event: MenuInfo) => {
            const { key } = event;
            if (key === 'logout') {
                flushSync(() => {
                    setInitialState((s) => ({ ...s, currentUser: undefined }));
                });
                loginOut();
                return;
            }
            history.push(`/account/${key}`);
        },
        [setInitialState],
    );

    const { currentUser } = initialState || {};

    if (!currentUser) {
        return (
            <Link to="/user/login">
                <Button type="primary" shape="round">
                    {t.login}
                </Button>
            </Link>
        );
    }

    const menuItems = [
        ...(menu
            ? [
                {
                    key: 'center',
                    icon: <UserOutlined />,
                    label: t.userCenter,
                },
                {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: t.userSettings,
                },
                {
                    type: 'divider' as const,
                },
            ]
            : []),
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: t.logout,
        },
    ];

    return (
        <HeaderDropdown
            menu={{
                selectedKeys: [],
                onClick: onMenuClick,
                items: menuItems,
            }}
        >
            <Space>
                {currentUser?.userAvatar ? (
                    <Avatar size="small" src={currentUser?.userAvatar} />
                ) : (
                    <Avatar size="small" icon={<UserOutlined />} />
                )}
                <span className="anticon">{currentUser?.userName ?? t.noName}</span>
            </Space>
        </HeaderDropdown>
    );
};

export const AvatarName = () => {};
