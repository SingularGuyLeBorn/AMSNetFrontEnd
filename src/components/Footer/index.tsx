import { GithubOutlined, FileOutlined } from '@ant-design/icons';
import { DefaultFooter } from '@ant-design/pro-components';
import '@umijs/max';
import React from 'react';

const Footer: React.FC = () => {
  const defaultMessage = 'IDT@2024';
  const currentYear = new Date().getFullYear();
  return (
    <DefaultFooter
      style={{
        background: 'none',
      }}
      copyright={`${currentYear} ${defaultMessage}`}
      links={[
        {
          key: 'codeNav',
          title: (
              <>
                <FileOutlined /> AMSNet
              </>
          ),
          href: 'https://arxiv.org/abs/2405.09045',
          blankTarget: true,
        },
        {
          key: 'AMSNet-KG',
          title: (
            <>
              <FileOutlined /> AMSNet-KG
            </>
          ),
          href: 'https://arxiv.org/abs/2411.13560',
          blankTarget: true,
        },
      ]}
    />
  );
};
export default Footer;
