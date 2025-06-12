// index.tsx

import React, { useState, useRef, useEffect, ChangeEvent, MouseEvent, useCallback } from 'react';
import { Card, Button, Input, Popover, InputNumber, Layout, message, Select, Typography, Space, Tooltip } from 'antd';
import { useModel } from "@umijs/max";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faFolderOpen, faSave, faUndo, faTrash, faHistory,
  faArrowLeft, faArrowRight, faTag, faPaintBrush, faPlus, faKey, faPen, faList, faEye, faMinusCircle, faMousePointer
} from "@fortawesome/free-solid-svg-icons";
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';

// --- 真实外部依赖导入 ---
import {
  createNode,
  findNode,
  createRelationship
} from '@/pages/GraphOperate/Components/apiFunctions';
import { indexClassColorMap, jsonNameColorMap } from './Constants/constants';

const { Option } = Select;
const { Title } = Typography;

// ===================================================================
// 接口与类型定义 (Interfaces & Type Definitions)
// ===================================================================
interface FileOperateProps {}

interface JsonInterface {
  local: {
    buildingBlocks: { [key: string]: string[] };
    constants: { [key: string]: string[] };
  };
  global: { [key: string]: any };
}

/**
 * @description 定义一个统一的操作记录类型，用于实现跨功能（绘制、染色）的撤销。
 * 'draw' 类型记录了新绘制框的完整YOLO格式字符串。
 * 'stain' 类型记录了染色操作的所有必要信息：组件类型、组件名称和被染色的框的唯一名称。
 */
type Operation =
  | { type: 'draw'; data: string }
  | { type: 'stain'; data: { jsonType: 'buildingBlocks' | 'constants'; jsonName: string; boxName: string } };

// ===================================================================
// 国际化文本 (i18n Translations)
// ===================================================================
const translations = {
  zh: {
    uploadFolder: '上传文件夹', undo: '撤销操作', save: '保存', deleteBox: '删除选中框',
    restoreDeleted: '恢复删除', category: '标注类别', previous: '上一个', next: '下一个',
    currentFile: '当前文件', function: '高级功能', allowColoring: '染色模式', notAllowColoring: '绘制模式',
    addProperty: '增加属性', addNode: '添加节点', nodeName: '节点名称', key: '键', value: '值',
    delete: '删除', saveCurrent: '保存当前', saveAll: '保存全部',
    chooseJsonName: '选择组件', chooseJsonType: '选择类型',
    noFile: '没有可保存的文件', noDeletedBoxes: '没有可恢复的删除框',
    fileManagement: '文件管理', annotationTools: '标注工具', actions: '操作历史',
    dataExplorer: '数据浏览器'
  },
  en: {
    uploadFolder: 'Upload Folder', undo: 'Undo Action', save: 'Save', deleteBox: 'Delete Selected',
    restoreDeleted: 'Restore Deleted', category: 'Category', previous: 'Previous', next: 'Next',
    currentFile: 'Current File', function: 'Advanced Functions', allowColoring: 'Coloring Mode', notAllowColoring: 'Drawing Mode',
    addProperty: 'Add Property', addNode: 'Add Node', nodeName: 'Node Name', key: 'Key',
    value: 'Value', delete: 'Delete', saveCurrent: 'Save Current', saveAll: 'Save All',
    chooseJsonName: 'Choose Component', chooseJsonType: 'Choose Type',
    noFile: 'No files to save', noDeletedBoxes: 'No deleted boxes to restore for this picture',
    fileManagement: 'File Management', annotationTools: 'Annotation Tools', actions: 'Actions & History',
    dataExplorer: 'Data Explorer'
  }
};


// ===================================================================
// 主组件 (Main Component)
// ===================================================================
const FileOperate: React.FC<FileOperateProps> = () => {

  // --- 状态管理 (State Management) ---
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];
  const [indexClassColorMapState, setIndexClassColorMapState] = useState(indexClassColorMap);
  const [pngList, setPngList] = useState<File[]>([]);
  const [jpgList, setJpgList] = useState<File[]>([]);
  const [yoloList, setYoloList] = useState<File[]>([]);
  const [jsonList, setJsonList] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentPng, setCurrentPng] = useState<File | null>(null);
  const [currentJpg, setCurrentJpg] = useState<File | null>(null);
  const [currentJsonContent, setCurrentJsonContent] = useState<string | null>(null);
  const [currentYoloContent, setCurrentYoloContent] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [currentClassIndex, setCurrentClassIndex] = useState<number>(0);
  const [currentClassLabel, setCurrentClassLabel] = useState<string>(indexClassColorMapState[0]?.label || '');
  const [currentClassColor, setCurrentClassColor] = useState<string>(indexClassColorMapState[0]?.color || '');
  const [nodeName, setNodeName] = useState<string>('');
  const [nodePropertiesKeys, setNodePropertiesKeys] = useState<string[]>([]);
  const [nodePropertiesValues, setNodePropertiesValues] = useState<string[]>([]);
  const [operationHistory, setOperationHistory] = useState<Operation[]>([]);
  const [deletedBoxHistories, setDeletedBoxHistories] = useState<Map<number, { index: number; content: string }[]>>(new Map());
  const [isDrawing, setIsDrawing] = useState(false);
  const [mouseDownCoords, setMouseDownCoords] = useState({ x: 0, y: 0 });
  const [canvasImageData, setCanvasImageData] = useState<ImageData | null>(null);
  const [selectedJsonName, setSelectedJsonName] = useState<string | null>(null);
  const [selectedJsonType, setSelectedJsonType] = useState<'buildingBlocks' | 'constants' | null>(null);
  const [isAllowClickToFillRect, setIsAllowClickToFillRect] = useState(false);
  const [globalList, setGlobalList] = useState<{ [key: number]: { nodeName: string, nodePropertiesKeys: string[], nodePropertiesValues: string[] } }>({});
  const [tempBoxData, setTempBoxData] = useState({
    relativeClassIndexTemp: currentClassIndex,
    relativeXTemp: 0, relativeYTemp: 0,
    relativeWTemp: 0, relativeHTemp: 0,
  });
  const [dataPaneWidth, setDataPaneWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  /**
   * @description 关键状态：重绘触发器。这是一个解决React状态异步更新导致画面不一致问题的核心机制。
   * 任何需要强制重绘画布的操作（如加载新文件、撤销操作等）都通过改变这个计数器来发起一个明确的重绘请求。
   * 专门的useEffect会监听此状态的变化，并执行完整的画布重绘逻辑，确保数据与视图的最终一致性。
   */
  const [redrawTrigger, setRedrawTrigger] = useState(0);

  // --- 副作用钩子 (useEffect Hooks) ---
  useEffect(() => {
    const handleLanguageChange = (event: Event) => setCurrentLang((event as CustomEvent).detail.language);
    window.addEventListener('languageChange', handleLanguageChange);
    setCurrentLang(initialState?.language || 'zh');
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, [initialState?.language]);

  useEffect(() => {
    // 切换文件时，必须清空当前文件的操作历史记录，防止跨文件撤销。
    setOperationHistory([]);
    if (pngList.length > 0) setCurrentPng(pngList[currentIndex]); else setCurrentPng(null);
    if (jpgList.length > 0) setCurrentJpg(jpgList[currentIndex]); else setCurrentJpg(null);
    const readFileContent = (fileList: File[], setter: (content: string | null) => void) => {
      if (fileList.length > currentIndex) {
        const reader = new FileReader();
        reader.onload = (e) => setter((e.target?.result as string) || null);
        reader.readAsText(fileList[currentIndex]);
      } else { setter(null); }
    };
    readFileContent(yoloList, (content) => setCurrentYoloContent(content ? content.split('\n').filter(line => line.trim() !== '').join('\n') : null));
    readFileContent(jsonList, setCurrentJsonContent);
  }, [currentIndex, pngList, jpgList, yoloList, jsonList]);

  /**
   * @description 核心重绘逻辑。此useEffect是整个应用视觉表现的最终保障。
   * 它只依赖两个因素：当前图片(currentPng)的变更，和重绘触发器(redrawTrigger)的变更。
   * 任何时候这两个依赖之一发生变化，它都会执行一套完整的重绘流程：
   * 1. 加载并绘制背景图片。
   * 2. 根据最新的`currentYoloContent`绘制所有标注框。
   * 3. 根据最新的`currentJsonContent`对框进行染色。
   * 这种集中式的重绘逻辑，确保了无论中间状态如何变化，最终渲染到画布上的永远是最新、最准确的数据。
   */
  useEffect(() => {
    if (currentPng) {
      const canvas = canvasRef.current; if (!canvas) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        loadCurrentYoloContentToCanvas(currentYoloContent);
        loadCurrentJsonContentToCanvas(currentJsonContent);
      };
      img.src = URL.createObjectURL(currentPng);
    }
  }, [currentPng, redrawTrigger, currentYoloContent, currentJsonContent]); // 依赖项也包括数据源，确保数据变化时也重绘

  useEffect(() => {
    const data = globalList[currentIndex];
    setNodeName(data?.nodeName || '');
    setNodePropertiesKeys(data?.nodePropertiesKeys || []);
    setNodePropertiesValues(data?.nodePropertiesValues || []);
  }, [currentIndex, globalList]);

  const handleResize = useCallback((e: globalThis.MouseEvent) => {
    if (isResizing) setDataPaneWidth(prev => {
      const newWidth = window.innerWidth - e.clientX - 4;
      return (newWidth > 250 && newWidth < window.innerWidth - 300) ? newWidth : prev;
    });
  }, [isResizing]);
  const stopResizing = useCallback(() => setIsResizing(false), []);
  useEffect(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleResize, stopResizing]);

  // --- 数据处理与功能函数 ---
  const parseYoloContent = (relativeContent: string | null): string[] => {
    if (!relativeContent || !canvasRef.current || canvasRef.current.width === 0) return [];
    const canvas = canvasRef.current; const absoluteArray: string[] = [];
    relativeContent.split('\n').filter(Boolean).forEach(line => {
      const parts = line.split(' ').map(parseFloat); if (parts.length < 5 || parts.some(isNaN)) return;
      const [classIndex, relX, relY, relW, relH] = parts;
      const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
      const absRight = (relX + relW / 2) * canvas.width, absBottom = (relY + relH / 2) * canvas.height;
      const color = indexClassColorMapState[classIndex]?.color;
      if (color) absoluteArray.push(`${color} ${absLeft} ${absTop} ${absRight} ${absBottom}`);
    });
    return absoluteArray;
  };

  const addRectNameToYoloContent = (content: string | null): string => {
    if (!content) return '';
    const classCounterMap = new Map<string, number>();
    return content.split('\n').filter(Boolean).map(line => {
      const parts = line.split(' '); const classIndex = parts[0];
      const classCounter = classCounterMap.get(classIndex) || 0;
      classCounterMap.set(classIndex, classCounter + 1);
      const classLabel = indexClassColorMapState[parseInt(classIndex)]?.label || `class${classIndex}`;
      return `${classLabel}_${classCounter} ${line}`;
    }).join('\n');
  };

  const parseJsonContent = (jsonContent: string | null): JsonInterface => {
    const jsonObj: JsonInterface = { local: { buildingBlocks: {}, constants: {} }, global: {} };
    if (!jsonContent) return jsonObj;
    jsonContent.split('\n').filter(Boolean).forEach(line => {
      const [type, name, values] = line.split(':'); if (!type || !name || !values) return;
      const targetDict = jsonObj.local[type as keyof typeof jsonObj.local];
      if (targetDict) {
        if (!targetDict[name]) targetDict[name] = [];
        targetDict[name].push(...values.split(' ').filter(Boolean));
      }
    });
    return jsonObj;
  };

  const stringifyJsonContent = (jsonObj: JsonInterface): string => {
    const lines: string[] = [];
    Object.entries(jsonObj.local).forEach(([type, nameMap]) => {
      Object.entries(nameMap).forEach(([name, values]) => {
        const uniqueValues = [...new Set(values)];
        if (uniqueValues.length > 0) lines.push(`${type}:${name}:${uniqueValues.join(' ')}`);
      });
    });
    return lines.join('\n');
  };

  const loadCurrentPngToCanvas = (pngFile: File) => {
    setRedrawTrigger(prev => prev + 1);
  };

  const loadCurrentYoloContentToCanvas = (yoloContent: string | null) => {
    const canvas = canvasRef.current; if (!canvas || !yoloContent) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    parseYoloContent(yoloContent).forEach(item => {
      const [color, ...coords] = item.split(' ');
      const [left, top, right, bottom] = coords.map(parseFloat);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.rect(left, top, right - left, bottom - top); ctx.stroke();
    });
  };

  const loadCurrentJsonContentToCanvas = (jsonContent: string | null) => {
    const canvas = canvasRef.current; if (!canvas || !jsonContent || !currentYoloContent) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const parsedJson = parseJsonContent(jsonContent);
    const namedYoloMap = new Map(addRectNameToYoloContent(currentYoloContent).split('\n').map(line => {
      const [name, ...rest] = line.split(' '); return [name, rest.join(' ')];
    }));
    Object.entries(parsedJson.local).forEach(([type, nameMap]) => {
      Object.entries(nameMap).forEach(([name, boxNames]) => {
        const color = jsonNameColorMap[name]; if (!color) return;
        boxNames.forEach(boxName => {
          const yoloData = namedYoloMap.get(boxName); if (!yoloData) return;
          const [, relX, relY, relW, relH] = yoloData.split(' ').map(parseFloat);
          const absW = relW * canvas.width, absH = relH * canvas.height;
          const absX = (relX * canvas.width) - absW / 2, absY = (relY * canvas.height) - absH / 2;
          ctx.fillStyle = color; ctx.globalAlpha = 0.3;
          ctx.fillRect(absX, absY, absW, absH); ctx.globalAlpha = 1.0;
        });
      });
    });
  };

  const handleFolderUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files; if (!files) return;
    const newPngList: File[] = [], newJpgList: File[] = [], newYoloList: File[] = [], newJsonList: File[] = [];
    const parseClassFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target?.result) return;
        const newClassMap = { ...indexClassColorMapState };
        (e.target.result as string).split('\n').forEach(line => {
          const [indexStr, className] = line.split(':'); if (!indexStr || !className) return;
          const index = parseInt(indexStr.trim(), 10);
          if (!isNaN(index) && newClassMap[index]) newClassMap[index].label = className.trim();
        });
        setIndexClassColorMapState(newClassMap);
      };
      reader.readAsText(file);
    };
    Array.from(files).forEach(file => {
      if (file.name.toLowerCase().includes('class')) parseClassFile(file);
      else if (file.type === 'image/png') newPngList.push(file);
      else if (file.type === 'image/jpeg') newJpgList.push(file);
      else if (file.name.endsWith('.txt')) newYoloList.push(file);
      else if (file.name.endsWith('.json')) newJsonList.push(file);
    });
    const compareFn = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });
    setPngList(newPngList.sort(compareFn));
    setJpgList(newJpgList.sort(compareFn));
    setYoloList(newYoloList.sort(compareFn));
    setJsonList(newJsonList.sort(compareFn));
    setCurrentIndex(0);
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    setMouseDownCoords({ x, y });
    if (isAllowClickToFillRect) { handleJsonBoxClick(e); return; }
    setIsDrawing(true);
    const ctx = canvas.getContext('2d'); if (ctx) setCanvasImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas || !isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left, currentY = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (ctx && canvasImageData) {
      ctx.putImageData(canvasImageData, 0, 0);
      ctx.beginPath(); ctx.strokeStyle = currentClassColor || 'black'; ctx.lineWidth = 2;
      ctx.rect(mouseDownCoords.x, mouseDownCoords.y, currentX - mouseDownCoords.x, currentY - mouseDownCoords.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const upX = e.clientX - rect.left, upY = e.clientY - rect.top;
    const x1 = Math.min(mouseDownCoords.x, upX), y1 = Math.min(mouseDownCoords.y, upY);
    const width = Math.abs(upX - mouseDownCoords.x), height = Math.abs(upY - mouseDownCoords.y);
    if (width > 1 && height > 1) {
      const x_center = (x1 + width / 2) / canvas.width, y_center = (y1 + height / 2) / canvas.height;
      const yoloWidth = width / canvas.width, yoloHeight = height / canvas.height;
      const yoloFormatData = `${currentClassIndex} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${yoloWidth.toFixed(6)} ${yoloHeight.toFixed(6)}`;
      setOperationHistory(prev => [...prev, { type: 'draw', data: yoloFormatData }]);
      setCurrentYoloContent(prev => (prev ? `${prev}\n${yoloFormatData}` : yoloFormatData));
    } else if (canvasImageData) {
      const ctx = canvas.getContext('2d'); if (ctx) ctx.putImageData(canvasImageData, 0, 0);
    }
    setCanvasImageData(null);
  };

  const handleJsonBoxClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isAllowClickToFillRect || !selectedJsonName || !selectedJsonType) return;
    const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const namedYoloLines = addRectNameToYoloContent(currentYoloContent).split('\n');
    for (const line of namedYoloLines) {
      const [boxName, ...rest] = line.split(' '); const yoloData = rest.join(' ');
      const [, x, y, w, h] = yoloData.split(' ').map(parseFloat);
      const boxX = x * canvas.width, boxY = y * canvas.height;
      const boxW = w * canvas.width, boxH = h * canvas.height;
      const left = boxX - boxW/2, top = boxY - boxH/2;
      if (mouseX >= left && mouseX <= left + boxW && mouseY >= top && mouseY <= top + boxH) {
        setOperationHistory(prev => [...prev, { type: 'stain', data: { jsonType: selectedJsonType!, jsonName: selectedJsonName, boxName } }]);
        setCurrentJsonContent(prevJson => {
          const jsonObj = parseJsonContent(prevJson);
          const targetDict = jsonObj.local[selectedJsonType!];
          if (!targetDict[selectedJsonName]) targetDict[selectedJsonName] = [];
          if (!targetDict[selectedJsonName].includes(boxName)) targetDict[selectedJsonName].push(boxName);
          return stringifyJsonContent(jsonObj);
        });
        break;
      }
    }
  };

  const handleUndo = () => {
    if (operationHistory.length === 0) { message.info("没有可撤销的操作"); return; }
    const lastOperation = operationHistory[operationHistory.length - 1];
    if (lastOperation.type === 'draw') {
      const yoloStringToUndo = lastOperation.data;
      if (currentYoloContent && currentYoloContent.includes(yoloStringToUndo)) {
        const lines = currentYoloContent.split('\n');
        const indexToRemove = lines.lastIndexOf(yoloStringToUndo);
        if (indexToRemove > -1) {
          lines.splice(indexToRemove, 1);
          setCurrentYoloContent(lines.join('\n'));
        }
      }
    } else if (lastOperation.type === 'stain') {
      const { jsonType, jsonName, boxName } = lastOperation.data;
      const jsonObj = parseJsonContent(currentJsonContent);
      const targetArray = jsonObj.local[jsonType]?.[jsonName];
      if (targetArray) {
        const indexToRemove = targetArray.lastIndexOf(boxName);
        if (indexToRemove > -1) {
          targetArray.splice(indexToRemove, 1);
          if (targetArray.length === 0) delete jsonObj.local[jsonType][jsonName];
          setCurrentJsonContent(stringifyJsonContent(jsonObj));
        }
      }
    }
    setOperationHistory(prev => prev.slice(0, -1));
    message.success('成功撤销上一步操作');
  };

  const handleDeleteBox = () => {
    const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return;
    const rects = parseYoloContent(currentYoloContent).map(line => {
      const [, ...coords] = line.split(' '); const [left, top, right, bottom] = coords.map(parseFloat);
      return { left, top, right, bottom };
    });
    const rectToDeleteIndex = rects.findIndex(r => mouseDownCoords.x >= r.left && mouseDownCoords.x <= r.right && mouseDownCoords.y >= r.top && mouseDownCoords.y <= r.bottom);
    if (rectToDeleteIndex !== -1) {
      const lines = currentYoloContent.split('\n');
      const [deletedLine] = lines.splice(rectToDeleteIndex, 1);
      const newHistories = new Map(deletedBoxHistories);
      const history = newHistories.get(currentIndex) || [];
      history.push({ index: rectToDeleteIndex, content: deletedLine });
      newHistories.set(currentIndex, history);
      setCurrentYoloContent(lines.join('\n'));
      message.success('成功删除一个标注框');
    } else {
      message.info('请先用鼠标点击要删除的框，再按此按钮');
    }
  };

  const handleDeleteBoxUndo = () => {
    const historyForCurrent = deletedBoxHistories.get(currentIndex);
    if (!historyForCurrent || historyForCurrent.length === 0) { message.warning(t.noDeletedBoxes); return; }
    const lastDeleted = historyForCurrent.pop()!;
    const lines = currentYoloContent ? currentYoloContent.split('\n').filter(Boolean) : [];
    lines.splice(lastDeleted.index, 0, lastDeleted.content);
    setCurrentYoloContent(lines.join('\n'));
    setDeletedBoxHistories(new Map(deletedBoxHistories));
    message.success('成功恢复一个删除的框');
  };

  const selectCurrentClassByIndex = (classIndex: number) => {
    const selectedClass = indexClassColorMapState[classIndex];
    if (selectedClass) {
      setCurrentClassIndex(classIndex); setCurrentClassLabel(selectedClass.label); setCurrentClassColor(selectedClass.color);
    }
  };

  const handleAddNodeProperty = () => { setNodePropertiesKeys([...nodePropertiesKeys, '']); setNodePropertiesValues([...nodePropertiesValues, '']); };
  const handleUpdateNodeProperty = (index: number, field: 'key' | 'value', value: string) => {
    if (field === 'key') setNodePropertiesKeys(nodePropertiesKeys.map((k, i) => i === index ? value : k));
    else setNodePropertiesValues(nodePropertiesValues.map((v, i) => i === index ? value : v));
  };
  const removeNodeProperty = (index: number) => {
    setNodePropertiesKeys(nodePropertiesKeys.filter((_, i) => i !== index));
    setNodePropertiesValues(nodePropertiesValues.filter((_, i) => i !== index));
  };

  const handleCreateNode = async () => {
    const propertiesObj: { [key: string]: any } = {};
    nodePropertiesKeys.forEach((key, index) => { if(key) propertiesObj[key] = nodePropertiesValues[index]; });
    const canvas = canvasRef.current;
    if (canvas && currentPng) { propertiesObj['annotatedImage'] = canvas.toDataURL('image/png'); propertiesObj['ImgName'] = currentPng.name; }
    const newNode = { name: nodeName, properties: propertiesObj };
    try {
      const result = await createNode(newNode);
      if (result.code !== 0) { message.error(`创建节点失败: ${result.code}`); return; }
      message.success(`节点 "${nodeName}" 创建成功!`);
      for (const [key, value] of Object.entries(propertiesObj)) {
        const relatedNodeName = `${key}_${value}`;
        try {
          const relatedNode = await findNode({ name: relatedNodeName });
          if (!relatedNode) {
            await createNode({ name: relatedNodeName, properties: { [key]: value } });
            await createRelationship({ name: key, properties: { fromNode: newNode.name, toNode: relatedNodeName } });
          } else {
            await createRelationship({ name: key, properties: { fromNode: newNode.name, toNode: relatedNode.name } });
          }
        } catch (error) { console.error(`处理属性关系时出错 ${key}: ${error}`); }
      }
    } catch (error) { message.error(`创建节点时发生错误: ${error}`); }
  };

  const saveContentAsFile = (indexToSave: number) => {
    if (currentYoloContent !== null) setYoloList(prev => { const n = [...prev]; n[indexToSave] = new File([currentYoloContent], `${indexToSave + 1}.txt`, { type: 'text/plain' }); return n; });
    if (currentJsonContent !== null) setJsonList(prev => { const n = [...prev]; n[indexToSave] = new File([currentJsonContent], `${indexToSave + 1}.json`, { type: 'application/json' }); return n; });
    setGlobalList(prev => ({ ...prev, [indexToSave]: { nodeName, nodePropertiesKeys, nodePropertiesValues } }));
  };

  const handleNextIndex = () => { if (currentIndex < pngList.length - 1) { saveContentAsFile(currentIndex); setCurrentIndex(p => p + 1); } };
  const handlePrevIndex = () => { if (currentIndex > 0) { saveContentAsFile(currentIndex); setCurrentIndex(p => p - 1); } };

  const handleSaveCurrentYoloAndJsonToLocal = () => {
    if(currentYoloContent) saveAs(new Blob([currentYoloContent], {type: "text/plain;charset=utf-8"}), yoloList[currentIndex]?.name || `${currentIndex + 1}.txt`);
    if(currentJsonContent) saveAs(new Blob([currentJsonContent], {type: "application/json;charset=utf-8"}), jsonList[currentIndex]?.name || `${currentIndex + 1}.json`);
    message.success('当前文件已保存到本地');
  };
  const handleSaveYoloAndJsonListToLocal = async () => {
    if (yoloList.length === 0) { message.warning(t.noFile); return; }
    const zip = new JSZip();
    for (let i = 0; i < yoloList.length; i++) {
      const yoloContent = i === currentIndex ? currentYoloContent : await yoloList[i].text();
      const jsonContent = i === currentIndex ? currentJsonContent : (jsonList[i] ? await jsonList[i].text() : "{}");
      if(yoloContent) zip.file(yoloList[i].name, yoloContent);
      if(jsonContent) zip.file(jsonList[i]?.name || `${i + 1}.json`, jsonContent);
    }
    zip.generateAsync({ type: 'blob' }).then(content => saveAs(content, 'annotations.zip'));
    message.success('所有文件已打包下载');
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <Card title={<span><FontAwesomeIcon icon={faFolderOpen} /> {t.fileManagement}</span>} size="small">
          <div className="control-group">
            <Button type="primary" onClick={() => document.getElementById('folder-upload-input')?.click()} icon={<FontAwesomeIcon icon={faUpload} />}>
              {t.uploadFolder}
            </Button>
            <input type="file" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} className="input-hidden-style" id="folder-upload-input" />
            <div className='file-nav'>
              <Button onClick={handlePrevIndex} disabled={currentIndex === 0} icon={<FontAwesomeIcon icon={faArrowLeft} />} />
              <InputNumber min={1} max={pngList.length || 1} value={currentIndex + 1}
                           onChange={(value) => { if (value && value > 0 && value <= pngList.length) { saveContentAsFile(currentIndex); setCurrentIndex(value - 1); } }}
                           style={{ width: '100%', textAlign: 'center' }}
              />
              <Button onClick={handleNextIndex} disabled={currentIndex >= pngList.length - 1} icon={<FontAwesomeIcon icon={faArrowRight} />} />
            </div>
            <div className="file-info">{t.currentFile}: {currentPng?.name || 'N/A'} ({currentIndex + 1} / {pngList.length})</div>
          </div>
        </Card>

        <Card title={<span><FontAwesomeIcon icon={faPaintBrush} /> {t.annotationTools}</span>} size="small">
          <div className="control-group">
            <Popover placement="rightTop" content={
              <div style={{ maxHeight: '300px', overflowY: 'auto', width: 250 }}>
                {Object.entries(indexClassColorMapState).map(([idx, { color, label }]) => (
                  <Button key={idx} onClick={() => selectCurrentClassByIndex(parseInt(idx))} style={{ width: '100%', justifyContent: 'flex-start', backgroundColor: parseInt(idx) === currentClassIndex ? '#e6f7ff' : 'transparent' }}>
                    <div style={{ width: '16px', height: '16px', backgroundColor: color, marginRight: '8px', borderRadius: '4px' }} />
                    {`[${idx}] ${label}`}
                  </Button>
                ))}
              </div>
            } title="选择标注类别" trigger="click">
              <Button>
                <div style={{ width: '16px', height: '16px', backgroundColor: currentClassColor, borderRadius: '4px', marginRight: 8 }} />
                {currentClassLabel}
              </Button>
            </Popover>
            <Select placeholder={t.chooseJsonName} value={selectedJsonName} onChange={setSelectedJsonName} style={{ width: '100%' }}>
              {Object.keys(jsonNameColorMap).map(name => <Option key={name} value={name}>{name}</Option>)}
            </Select>
            <Select placeholder={t.chooseJsonType} value={selectedJsonType} onChange={(v) => setSelectedJsonType(v as any)} style={{ width: '100%' }}>
              <Option key="buildingBlocks" value="buildingBlocks">Building Blocks</Option>
              <Option key="constants" value="constants">Constants</Option>
            </Select>
          </div>
        </Card>

        <Card title={<span><FontAwesomeIcon icon={faList} /> {t.actions}</span>} size="small">
          <div className="control-group">
            <Button onClick={() => setIsAllowClickToFillRect(!isAllowClickToFillRect)} type={isAllowClickToFillRect ? 'primary' : 'default'} ghost={isAllowClickToFillRect} icon={isAllowClickToFillRect ? <FontAwesomeIcon icon={faEye} /> : <FontAwesomeIcon icon={faPen} />}>
              {isAllowClickToFillRect ? t.allowColoring : t.notAllowColoring}
            </Button>
            <Space.Compact style={{width: '100%'}}>
              <Tooltip title={t.undo}><Button onClick={handleUndo} style={{width: '50%'}} icon={<FontAwesomeIcon icon={faUndo} />} /></Tooltip>
              <Tooltip title={t.deleteBox}><Button onClick={handleDeleteBox} style={{width: '50%'}} icon={<FontAwesomeIcon icon={faMousePointer} />} danger /></Tooltip>
            </Space.Compact>
            <Space.Compact style={{width: '100%'}}>
              <Tooltip title={t.restoreDeleted}><Button onClick={handleDeleteBoxUndo} style={{width: '50%'}} icon={<FontAwesomeIcon icon={faHistory} />} /></Tooltip>
              <Popover placement="rightTop" content={
                <>
                  <Button onClick={handleSaveCurrentYoloAndJsonToLocal} style={{ marginRight: 8 }}>{t.saveCurrent}</Button>
                  <Button onClick={handleSaveYoloAndJsonListToLocal}>{t.saveAll}</Button>
                </>
              } title="保存选项" trigger="click">
                <Button type="primary" style={{width: '50%'}} icon={<FontAwesomeIcon icon={faSave} />} />
              </Popover>
            </Space.Compact>
          </div>
        </Card>

        <Card title={<span><FontAwesomeIcon icon={faTag} /> {t.function}</span>} size="small">
          <div className="control-group">
            <Input placeholder={t.nodeName} value={nodeName} onChange={(e) => setNodeName(e.target.value)} />
            {nodePropertiesKeys.map((key, index) => (
              <Space.Compact key={index} style={{ width: '100%' }}>
                <Input placeholder={t.key} value={key} onChange={(e) => handleUpdateNodeProperty(index, 'key', e.target.value)} />
                <Input placeholder={t.value} value={nodePropertiesValues[index]} onChange={(e) => handleUpdateNodeProperty(index, 'value', e.target.value)} />
                <Tooltip title={t.delete}><Button onClick={() => removeNodeProperty(index)} icon={<FontAwesomeIcon icon={faMinusCircle} />} danger /></Tooltip>
              </Space.Compact>
            ))}
            <Button onClick={handleAddNodeProperty} icon={<FontAwesomeIcon icon={faPlus} />}>{t.addProperty}</Button>
            <Button onClick={handleCreateNode} type="primary" ghost>{t.addNode}</Button>
          </div>
        </Card>
      </aside>

      <main className="main-content-wrapper">
        <div className="canvas-pane">
          <canvas ref={canvasRef} className="canvas-element" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />
        </div>
        <div onMouseDown={() => setIsResizing(true)} className={`resizable-handle ${isResizing ? 'resizing' : ''}`} />
        <div className="data-pane" style={{ width: `${dataPaneWidth}px` }}>
          <Title level={5}>{t.dataExplorer}</Title>
          <textarea ref={textareaRef} value={addRectNameToYoloContent(currentYoloContent)} className="custom-textarea" readOnly />
        </div>
      </main>
    </div>
  );
};

export default FileOperate;
