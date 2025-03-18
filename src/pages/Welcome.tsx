import { PageContainer } from '@ant-design/pro-components';
import { useModel } from '@umijs/max';
import { Card, theme } from 'antd';
import React, { useState, useEffect } from 'react';

// 定义翻译内容
const translations = {
    zh: {
        welcomeTitle: '欢迎使用AMSNet',
        welcomeDesc: 'AMSNet是宁波东方理工研究院在电路研究领域的重要成果，是用于模拟/混合信号（AMS）电路的网表数据集。它通过自动技术将电路图转换为网表，为电路设计提供关键数据支持，以解决多模态大语言模型（MLLM）在自动生成AMS电路时缺乏全面数据集的问题。\n\n数据集包含晶体管级电路图和SPICE格式网表，其规模和电路复杂性正在快速扩展，还计划纳入晶体管尺寸和性能规格等信息。同时也在探索功能宏识别（如检测LDO、ADC、DAC、PLL等）来丰富功能，提高电路设计效率。',
        learnMore: '了解更多',
        card1Title: '了解AMSNet数据集',
        card1Desc: '包含晶体管级电路图和SPICE网表，为电路设计提供数据支持。',
        card2Title: 'AMSNet的功能扩展',
        card2Desc: '正在快速扩展规模和复杂性，计划纳入晶体管尺寸和性能规格，探索功能宏识别。',
        card3Title: 'AMSNet在电路设计中的应用',
        card3Desc: '促进MLLM在AMS电路设计中的应用探索，为电路设计提供高效支持。'
    },
    en: {
        welcomeTitle: 'Welcome to AMSNet',
        welcomeDesc: 'AMSNet is an important achievement of Ningbo Oriental Institute of Technology in the field of circuit research, a netlist dataset for analog/mixed signal (AMS) circuits. It converts circuit diagrams into netlists through automated technology, providing key data support for circuit design, to address the lack of comprehensive datasets when multimodal large language models (MLLM) automatically generate AMS circuits.\n\nThe dataset contains transistor-level circuit diagrams and SPICE format netlists, with scale and circuit complexity rapidly expanding. There are plans to incorporate transistor dimensions and performance specifications. Meanwhile, functional macro recognition (such as detecting LDO, ADC, DAC, PLL, etc.) is being explored to enrich functionality and improve circuit design efficiency.',
        learnMore: 'Learn More',
        card1Title: 'About AMSNet Dataset',
        card1Desc: 'Contains transistor-level circuit diagrams and SPICE netlists, providing data support for circuit design.',
        card2Title: 'AMSNet Feature Extensions',
        card2Desc: 'Rapidly expanding in scale and complexity, planning to incorporate transistor dimensions and performance specifications, exploring functional macro recognition.',
        card3Title: 'AMSNet Applications in Circuit Design',
        card3Desc: 'Promotes the application exploration of MLLM in AMS circuit design, providing efficient support for circuit design.'
    }
};

/**
 * 每个单独的卡片，为了复用样式抽成了组件
 * @param param0
 * @returns
 */
const InfoCard: React.FC<{
    title: string;
    index: number;
    desc: string;
    href: string;
    learnMoreText: string;
}> = ({ title, href, index, desc, learnMoreText }) => {
    const { useToken } = theme;

    const { token } = useToken();

    return (
        <div
            style={{
                backgroundColor: token.colorBgContainer,
                boxShadow: token.boxShadow,
                borderRadius: '8px',
                fontSize: '14px',
                color: token.colorTextSecondary,
                lineHeight: '22px',
                padding: '16px 19px',
                minWidth: '220px',
                flex: 1,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center',
                }}
            >
                <div
                    style={{
                        width: 48,
                        height: 48,
                        lineHeight: '22px',
                        backgroundSize: '100%',
                        textAlign: 'center',
                        padding: '8px 16px 16px 12px',
                        color: '#FFF',
                        fontWeight: 'bold',
                    }}
                >
                    {index}
                </div>
                <div
                    style={{
                        fontSize: '16px',
                        color: token.colorText,
                        paddingBottom: 8,
                    }}
                >
                    {title}
                </div>
            </div>
            <div
                style={{
                    fontSize: '14px',
                    color: token.colorTextSecondary,
                    textAlign: 'justify',
                    lineHeight: '22px',
                    marginBottom: 8,
                }}
            >
                {desc}
            </div>
            <a href={href} target="_blank" rel="noreferrer">
                {learnMoreText} {'>'}
            </a>
        </div>
    );
};

const Welcome: React.FC = () => {
    const { token } = theme.useToken();
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

        // message.info(currentLang === 'zh' ? '已切换为中文' : 'Language changed to English');

        return () => {
            window.removeEventListener('languageChange', handleLanguageChange);
        };
    }, [initialState?.language]);

    return (
        <PageContainer>
            <Card
                style={{
                    borderRadius: 8,
                }}
                bodyStyle={{
                    backgroundImage:
                        initialState?.settings?.navTheme === 'realDark'
                            ? 'background-image: linear-gradient(75deg, #1A1B1F 0%, #191C1F 100%)'
                            : 'background-image: linear-gradient(75deg, #FBFDFF 0%, #F5F7FF 100%)',
                }}
            >
                <div
                    style={{
                        backgroundPosition: '100% -30%',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '274px auto',
                    }}
                >
                    <div
                        style={{
                            fontSize: '20px',
                            color: token.colorTextHeading,
                        }}
                    >
                        {t.welcomeTitle}
                    </div>
                    <p
                        style={{
                            fontSize: '14px',
                            color: token.colorTextSecondary,
                            lineHeight: '22px',
                            marginTop: 16,
                            marginBottom: 32,
                            width: '65%',
                        }}
                    >
                        {t.welcomeDesc}
                    </p>
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 16,
                        }}
                    >
                        <InfoCard
                            index={1}
                            href="https://ams-net.github.io/"
                            title={t.card1Title}
                            desc={t.card1Desc}
                            learnMoreText={t.learnMore}
                        />
                        <InfoCard
                            index={2}
                            href="https://your-link-2.com"
                            title={t.card2Title}
                            desc={t.card2Desc}
                            learnMoreText={t.learnMore}
                        />
                        <InfoCard
                            index={3}
                            href="https://your-link-3.com"
                            title={t.card3Title}
                            desc={t.card3Desc}
                            learnMoreText={t.learnMore}
                        />
                    </div>
                </div>
            </Card>
        </PageContainer>
    );
};

export default Welcome;
