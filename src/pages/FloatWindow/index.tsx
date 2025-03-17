import React, { useState, useRef, useEffect } from 'react';
import { Button, Input, Upload, message, Image, Spin, Tag } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  InboxOutlined,
  SendOutlined,
  DownOutlined,
  UpOutlined,
  MessageOutlined,
  CloseOutlined,
  CopyOutlined,
  ReloadOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './float-window.css';
import { useModel } from '@umijs/max';

const ChatGLM_API_Key = "df2bc2f478574aa6b6b251345afafd22.PQlSVfFXZ6hv5rF1";

const FILE_CONFIG = {
  image: ['image/png', 'image/jpeg', 'image/gif'],
  text: ['text/plain', 'text/x-python', 'text/x-matlab'],
  code: ['application/json'],
  office: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  files?: Array<{
    data: string;
    type: string;
    name: string;
    size: number;
    content?: string;
  }>;
}

const getFileType = (fileType: string) => {
  const allTypes = Object.entries(FILE_CONFIG).flatMap(([_, mimes]) => mimes);
  if (!allTypes.includes(fileType)) return 'other';
  return Object.entries(FILE_CONFIG).find(([_, mimes]) =>
    mimes.includes(fileType)
  )?.[0] || 'other';
};

const FloatWindow: React.FC = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [initialX, setInitialX] = useState(0);
  const [initialY, setInitialY] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Text translations for multi-language support
  const translations = {
    zh: {
      title: 'AI 对话助手(只支持单个图像)',
      minimize: '最小化窗口',
      clearContext: '清空上下文',
      clearDialogRecords: '清空对话记录',
      user: '您',
      assistant: '助手',
      viewLargeImage: '查看大图',
      fileType: '类型',
      fileSize: '大小',
      aiThinking: 'AI正在思考...',
      enterMessage: '输入消息或上传文件...',
      unsupportedFormat: '不支持的文件格式',
      fileSizeLimit: '文件大小超过5MB限制',
      pleaseEnterContent: '请输入内容或上传文件',
      contentCopied: '回答内容已复制到剪贴板',
      contextCleared: '对话上下文已清空',
      requestFailed: '请求失败',
      processingError: '请求处理失败'
    },
    en: {
      title: 'AI Assistant (Single Image Only)',
      minimize: 'Minimize Window',
      clearContext: 'Clear Context',
      clearDialogRecords: 'Clear Dialog Records',
      user: 'You',
      assistant: 'Assistant',
      viewLargeImage: 'View Large Image',
      fileType: 'Type',
      fileSize: 'Size',
      aiThinking: 'AI is thinking...',
      enterMessage: 'Enter message or upload a file...',
      unsupportedFormat: 'Unsupported file format',
      fileSizeLimit: 'File size exceeds 5MB limit',
      pleaseEnterContent: 'Please enter content or upload a file',
      contentCopied: 'Answer copied to clipboard',
      contextCleared: 'Dialog context cleared',
      requestFailed: 'Request failed',
      processingError: 'Processing error'
    }
  };

  // Get language from global state
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

    message.info(currentLang === 'zh' ? '已切换为中文' : 'Language changed to English');

    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, [initialState?.language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (headerRef.current) {
        setIsDragging(true);
        setInitialX(e.clientX);
        setInitialY(e.clientY);
        const rect = windowRef.current?.getBoundingClientRect();
        if (rect) {
          setOffsetX(rect.left);
          setOffsetY(rect.top);
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && windowRef.current) {
        const dx = e.clientX - initialX;
        const dy = e.clientY - initialY;
        windowRef.current.style.left = `${offsetX + dx}px`;
        windowRef.current.style.top = `${offsetY + dy}px`;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const header = headerRef.current;
    if (header) {
      header.addEventListener('mousedown', handleMouseDown);
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (header) {
        header.removeEventListener('mousedown', handleMouseDown);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, initialX, initialY, offsetX, offsetY]);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const processFile = async (file: File) => {
    const base64 = await convertFileToBase64(file);
    const fileType = getFileType(file.type);

    let textContent = '';
    if (FILE_CONFIG.text.includes(file.type) || FILE_CONFIG.code.includes(file.type)) {
      textContent = await file.text();
    }

    return {
      data: base64,
      type: file.type,
      name: file.name,
      size: file.size,
      content: textContent
    };
  };

  const callGLMAPI = async (messageHistory: ChatMessage[]) => {
    const controller = new AbortController();
    try {
      setLoading(true);

      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        return lastMessage?.role === 'assistant' && !lastMessage.content
          ? prev
          : [...prev, { role: 'assistant', content: '' }];
      });

      const apiMessages = messageHistory.map(msg => {
        if (msg.role === 'user') {
          const content = [
            ...(msg.files?.filter(f => FILE_CONFIG.image.includes(f.type))
              .map(file => ({
                type: "image_url",
                image_url: { url: file.data, detail: "high" }
              })) || []),
            { type: "text", text: msg.content || t.pleaseEnterContent }
          ];
          return { role: 'user', content };
        } else {
          return { role: 'assistant', content: msg.content };
        }
      });

      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ChatGLM_API_Key}`
        },
        body: JSON.stringify({
          model: 'glm-4v-flash',
          messages: apiMessages,
          temperature: 0.7,
          stream: true
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`${t.requestFailed}: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.replace(/^data: /, '').trim();
            if (!trimmedLine || trimmedLine === '[DONE]') continue;

            try {
              const json = JSON.parse(trimmedLine);
              const contentChunk = json.choices[0]?.delta?.content || '';
              if (contentChunk) {
                accumulatedContent += contentChunk;
                setMessages(prev => {
                  const lastMessage = prev[prev.length - 1];
                  return lastMessage?.role === 'assistant'
                    ? prev.map((msg, i) =>
                      i === prev.length - 1
                        ? { ...msg, content: accumulatedContent }
                        : msg
                    )
                    : prev;
                });
              }
            } catch (err) {
              console.error('解析流数据出错:', err);
            }
          }
        }
      }

      const formattedContent = marked(accumulatedContent)
        .replace(/(?:\\\((.*?)\\\))|(?:\\\[([\s\S]*?)\\\])/g, (_, inlineLatex, blockLatex) => {
          const latex = inlineLatex || blockLatex;
          const html = katex.renderToString(latex, { throwOnError: false });
          return inlineLatex
            ? `<span class="katex">${html}</span>`
            : `<div class="katex">${html}</div>`;
        });

      setMessages(prev =>
        prev.map((msg, i) =>
          i === prev.length - 1
            ? { ...msg, content: formattedContent }
            : msg
        )
      );

    } catch (error) {
      message.error((error as Error).message || t.processingError);
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        return lastMessage?.role === 'assistant' && !lastMessage.content
          ? prev.slice(0, -1)
          : prev;
      });
    } finally {
      setLoading(false);
    }
  };

  const beforeUpload = (file: File) => {
    const validTypes = Object.values(FILE_CONFIG).flat();
    const isValidType = validTypes.includes(file.type);
    const isValidSize = file.size < 5 * 1024 * 1024;

    if (!isValidType) {
      message.error(`${file.name} ${t.unsupportedFormat}`);
      return Upload.LIST_IGNORE;
    }

    if (!isValidSize) {
      message.error(`${file.name} ${t.fileSizeLimit}`);
      return Upload.LIST_IGNORE;
    }

    return true;
  };

  const renderFilePreview = (file: ChatMessage['files'][0]) => {
    const fileType = getFileType(file.type);

    switch (fileType) {
      case 'image':
        return <Image
          width={200}
          src={file.data}
          className="preview-image"
          alt="Upload preview"
          preview={{ mask: t.viewLargeImage }}
        />;

      case 'text':
      case 'code':
        return <div className={`${fileType}-preview`}>
          <h5>{file.name}</h5>
          <pre><code>{file.content}</code></pre>
        </div>;

      case 'office':
        return <div className="office-preview">
          <h5>{file.name}</h5>
          <p>{t.fileType}: {file.type.split('/').pop()?.toUpperCase()} File</p>
          <p>{t.fileSize}: {(file.size / 1024).toFixed(2)}KB</p>
        </div>;

      default:
        return <div className="file-info">
          <h5>{file.name}</h5>
          <p>{t.fileType}: {file.type}</p>
          <p>{t.fileSize}: {(file.size / 1024).toFixed(2)}KB</p>
        </div>;
    }
  };

  const handleSubmit = async () => {
    if (!inputText && fileList.length === 0) {
      message.warning(t.pleaseEnterContent);
      return;
    }

    const processedFiles = await Promise.all(
      fileList.map(async file =>
        await processFile(file.originFileObj as File)
      )
    );

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText,
      files: processedFiles
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      await callGLMAPI([...messages, userMessage]);
    } finally {
      setInputText('');
      setFileList([]);
    }
  };

  const renderMessageContent = (content: string) => {
    return (
      <div dangerouslySetInnerHTML={{
        __html: marked(content)
          .replace(/\\\(([^]*?)\\\)/g, (_, latex) =>
            katex.renderToString(latex, { throwOnError: false })
          )
          .replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) =>
            katex.renderToString(latex, { throwOnError: false, displayMode: true })
          )
      }} />
    );
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      message.success(t.contentCopied);
    });
  };

  const handleRetryMessage = (index: number) => {
    const message = messages[index];
    if (message.role === 'assistant') {
      const newMessageHistory = [...messages];
      newMessageHistory[index] = { ...message, content: '' };
      setMessages(newMessageHistory);
      callGLMAPI(newMessageHistory);
    }
  };

  const handleClearContext = () => {
    setMessages([]);
    setFileList([]);
    setInputText('');
    message.success(t.contextCleared);
  };

  const windowStyle: React.CSSProperties = {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: 9999,
    width: isMinimized ? '60px' : '400px',
    height: isMinimized ? '80px' : 'auto',
    background: 'white',
    borderRadius: isMinimized ? '50%' : '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
  };

  return (
    <div className="float-window" style={windowStyle} ref={windowRef}>
      {!isMinimized && (
        <>
          <div className="window-header" ref={headerRef}>
            <span className="window-title">{t.title}</span>
            <div className="header-buttons">
              <Button
                className="window-control-button"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearContext();
                }}
                type="text"
                shape="circle"
                title={t.clearContext}
              />
              <Button
                className="window-control-button"
                icon={<DownOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(true);
                }}
                type="text"
                shape="circle"
                title={t.minimize}
              />
            </div>
          </div>

          {messages.length > 0 && (
            <div className="clear-context-hint">
              <Button
                size="small"
                icon={<DeleteOutlined />}
                onClick={handleClearContext}
              >
                {t.clearDialogRecords}
              </Button>
            </div>
          )}

          <div className="messages-container">
            {messages.map((msg, index) => {
              if (msg.role === 'assistant' && !msg.content && index !== messages.length - 1) {
                return null;
              }
              return (
                <div key={index} className={`message-bubble ${msg.role}`}>
                  <div className="message-header">
                    <span className="message-role">
                      {msg.role === 'user' ? `👤 ${t.user}` : `🤖 ${t.assistant}`}
                    </span>
                    <span className="message-time">
                      {new Date().toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  {msg.files?.map((file, i) => (
                    <div key={i} className="file-preview">
                      {renderFilePreview(file)}
                    </div>
                  ))}

                  <div className="message-content">
                    {renderMessageContent(msg.content)}
                  </div>

                  {msg.role === 'assistant' && (
                    <div className="message-actions">
                      <Button
                        icon={<CopyOutlined />}
                        size="small"
                        onClick={() => handleCopyMessage(msg.content)}
                        className="copy-button"
                      />
                      <Button
                        icon={<ReloadOutlined />}
                        size="small"
                        onClick={() => handleRetryMessage(index)}
                        className="retry-button"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <Spin
                tip={t.aiThinking}
                className="loading-indicator"
                indicator={<div className="custom-spin" />}
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            <div className="input-area">
              <Upload
                multiple={false}
                maxCount={1}
                fileList={fileList}
                beforeUpload={beforeUpload}
                onChange={({ fileList: newFileList }) => {
                  setFileList(newFileList.slice(-1));
                }}
                showUploadList={false}
                disabled={loading}
                accept={Object.values(FILE_CONFIG)
                  .flat()
                  .map(type => `.${type.split('/').pop()}`)
                  .join(',')}
              >
                <Button
                  icon={<InboxOutlined />}
                  className="upload-button"
                  disabled={loading}
                />
              </Upload>

              <Input.TextArea
                className="message-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t.enterMessage}
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={loading}
                onPressEnter={(e) => {
                  if (!e.shiftKey && !loading) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />

              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                className="send-button"
                onClick={handleSubmit}
                loading={loading}
                disabled={loading}
              />
            </div>

            {fileList.length > 0 && (
              <div className="file-preview-list">
                {fileList.map((file) => (
                  <Tag
                    key={file.uid}
                    closable
                    className="file-tag"
                    onClose={() => setFileList(prev =>
                      prev.filter(f => f.uid !== file.uid)
                    )}
                    closeIcon={
                      <CloseOutlined
                        style={{ fontSize: 10, verticalAlign: '-1px' }}
                      />
                    }
                  >
                    {file.name}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isMinimized && (
        <div
          className="minimized-content"
          onDoubleClick={() => setIsMinimized(false)}
        >
          <MessageOutlined className="minimized-icon" />
        </div>
      )}
    </div>
  );
};

export default FloatWindow;
