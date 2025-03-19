import React, { useState, useEffect } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import { Card, theme } from 'antd';
import { useModel } from '@umijs/max';
import './Welcome.css'; // 引入美化后的 CSS

// 翻译内容
const translations = {
  zh: {
    welcomeTitle: '欢迎使用AMSNet',
    welcomeDesc:
      'AMSNet是宁波东方理工研究院在电路研究领域的重要成果，是用于模拟/混合信号（AMS）电路的网表数据集。它通过自动技术将电路图转换为网表，为电路设计提供关键数据支持，以解决多模态大语言模型（MLLM）在自动生成AMS电路时缺乏全面数据集的问题。\n\n数据集包含晶体管级电路图和SPICE格式网表，其规模和电路复杂性正在快速扩展，还计划纳入晶体管尺寸和性能规格等信息。同时也在探索功能宏识别（如检测LDO、ADC、DAC、PLL等）来丰富功能，提高电路设计效率。',
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
    welcomeDesc:
      'AMSNet is an important achievement of Ningbo Oriental Institute of Technology in the field of circuit research, a netlist dataset for analog/mixed signal (AMS) circuits. It converts circuit diagrams into netlists through automated technology, providing key data support for circuit design, to address the lack of comprehensive datasets when multimodal large language models (MLLM) automatically generate AMS circuits.\n\nThe dataset contains transistor-level circuit diagrams and SPICE format netlists, with scale and circuit complexity rapidly expanding. There are plans to incorporate transistor dimensions and performance specifications. Meanwhile, functional macro recognition (such as detecting LDO, ADC, DAC, PLL, etc.) is being explored to enrich functionality and improve circuit design efficiency.',
    learnMore: 'Learn More',
    card1Title: 'About AMSNet Dataset',
    card1Desc: 'Contains transistor-level circuit diagrams and SPICE netlists, providing data support for circuit design.',
    card2Title: 'AMSNet Feature Extensions',
    card2Desc: 'Rapidly expanding in scale and complexity, planning to incorporate transistor dimensions and performance specifications, exploring functional macro recognition.',
    card3Title: 'AMSNet Applications in Circuit Design',
    card3Desc: 'Promotes the application exploration of MLLM in AMS circuit design, providing efficient support for circuit design.'
  }
};

interface InfoCardProps {
  title: string;
  index: number;
  desc: string;
  href: string;
  learnMoreText: string;
}

/**
 * 带花哨动画效果的信息卡片组件
 */
const InfoCard: React.FC<InfoCardProps> = ({ title, href, index, desc, learnMoreText }) => {
  const { token } = theme.useToken();
  return (
    <div className="info-card flashy-card">
      <div className="card-header">
        <div className="index-box flashy-index">{index}</div>
        <div className="title" style={{ color: token.colorText }}>{title}</div>
      </div>
      <div className="desc">{desc}</div>
      <a href={href} target="_blank" rel="noreferrer" className="learn-more">
        {learnMoreText} <span className="arrow">&rarr;</span>
      </a>
    </div>
  );
};

const Welcome: React.FC = () => {
  const { token } = theme.useToken();
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  // 监听全局语言切换
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

  return (
    <PageContainer>
      <Card
        className="welcome-card flashy-background"
        bodyStyle={{ padding: '40px' }}
      >
        <div className="welcome-content">
          <h1 className="welcome-title flashy-text" style={{ color: token.colorTextHeading }}>
            {t.welcomeTitle}
          </h1>
          <p className="welcome-desc" style={{ color: token.colorTextSecondary }}>
            {t.welcomeDesc}
          </p>
          <div className="cards-container">
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
