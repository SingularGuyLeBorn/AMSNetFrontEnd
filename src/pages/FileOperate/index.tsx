import React, { useState, useRef, useEffect, ChangeEvent, MouseEvent, useCallback } from 'react';
import { Layout, Tabs, Button, Space, InputNumber, Typography, Select, Form, Input, Tooltip, message, Card } from 'antd';
import { useModel } from "@umijs/max";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faFolderOpen, faSave, faUndo, faRedo, faTrash, faHistory,
  faArrowLeft, faArrowRight, faTag, faPaintBrush, faPlus, faKey, faPen, faList, faEye, faMinusCircle, faMousePointer,
  faChevronLeft, faChevronRight // For inspector toggle
} from "@fortawesome/free-solid-svg-icons";
// 关键修复：导入现在会解析到 .ts 文件，所有类型都会被正确识别
import { indexClassColorMap, jsonNameColorMap, translations } from './constants';
import './index.css';

const { Option } = Select;
const { Text } = Typography;
const { Sider, Content } = Layout;
const { TabPane } = Tabs;

// 将接口定义移到组件外部，这是更好的实践
interface JsonData {
  local: {
    buildingBlocks: { [key: string]: string[] };
    constants: { [key: string]: string[] };
  };
  global: { [key: string]: any };
}

type Operation =
  | { type: 'draw'; yoloData: string[]; previousYoloContent: string | null }
  | { type: 'stain'; boxName: string; jsonType: 'buildingBlocks' | 'constants'; jsonName: string; previousJsonContent: string | null }
  | { type: 'delete'; deletedLines: { index: number; content: string }[]; previousYoloContent: string | null }
  | { type: 'json_change'; previousJsonContent: string | null; currentJsonContent: string | null };

const getFileNameWithoutExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return fileName;
  return fileName.substring(0, lastDotIndex);
};

const FileOperate: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];

  const [indexClassColorMapState, setIndexClassColorMapState] = useState(indexClassColorMap);
  const [pngList, setPngList] = useState<File[]>([]);
  const [yoloList, setYoloList] = useState<File[]>([]);
  const [jsonList, setJsonList] = useState<File[]>([]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentPng, setCurrentPng] = useState<File | null>(null);

  const [currentYoloContent, setCurrentYoloContent] = useState<string | null>(null);
  const [currentJsonContent, setCurrentJsonContent] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentClassIndex, setCurrentClassIndex] = useState<number>(0);

  const [nodeName, setNodeName] = useState<string>('');
  const [nodePropertiesKeys, setNodePropertiesKeys] = useState<string[]>([]);
  const [nodePropertiesValues, setNodePropertiesValues] = useState<string[]>([]);
  const [globalList, setGlobalList] = useState<{ [key: number]: { nodeName: string, nodePropertiesKeys: string[], nodePropertiesValues: string[] } }>({});

  const [operationHistory, setOperationHistory] = useState<Operation[]>([]);
  const [redoHistory, setRedoHistory] = useState<Operation[]>([]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [mouseDownCoords, setMouseDownCoords] = useState({ x: 0, y: 0 });
  const [canvasImageData, setCanvasImageData] = useState<ImageData | null>(null);

  const [selectedJsonName, setSelectedJsonName] = useState<string | null>(null);
  const [selectedJsonType, setSelectedJsonType] = useState<'buildingBlocks' | 'constants' | null>(null);
  const [isColoringMode, setIsColoringMode] = useState(false);

  const [redrawTrigger, setRedrawTrigger] = useState(0);

  const [leftSiderActualWidth, setLeftSiderActualWidth] = useState(300); // 恢复了布局相关的状态
  const [isResizingLeftSider, setIsResizingLeftSider] = useState(false);

  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [isResizingInspector, setIsResizingInspector] = useState(false);
  const [isInspectorVisible, setIsInspectorVisible] = useState(true);

  useEffect(() => {
    setCurrentLang(initialState?.language || 'zh');
  }, [initialState?.language]);

  const stringifyJsonContent = useCallback((jsonObj: JsonData): string => {
    return JSON.stringify(jsonObj, null, 2);
  }, []);

  const parseJsonContent = useCallback((jsonContent: string | null): JsonData => {
    try {
      if (!jsonContent || jsonContent.trim() === "" || jsonContent.trim() === "{}") {
        return { local: { buildingBlocks: {}, constants: {} }, global: {} };
      }
      const parsed = JSON.parse(jsonContent);
      parsed.local = parsed.local || { buildingBlocks: {}, constants: {} };
      parsed.local.buildingBlocks = parsed.local.buildingBlocks || {};
      parsed.local.constants = parsed.local.constants || {};
      parsed.global = parsed.global || {};
      return parsed;
    } catch (e) {
      console.error("JSON parsing failed, returning default object.", e);
      return { local: { buildingBlocks: {}, constants: {} }, global: {} };
    }
  }, []);

  useEffect(() => {
    setOperationHistory([]);
    setRedoHistory([]);

    if (pngList.length > 0 && currentIndex < pngList.length) {
      setCurrentPng(pngList[currentIndex]);
    } else {
      setCurrentPng(null);
      setCurrentYoloContent(null);
      setCurrentJsonContent(null);
      return;
    }

    const readFileContent = async (fileList: File[], index: number, setter: (content: string | null) => void) => {
      if (fileList.length > index && fileList[index]) {
        try {
          const text = await fileList[index].text();
          setter(text);
        } catch (e) {
          console.error("Error reading file:", e);
          setter(null);
        }
      } else {
        setter(null);
      }
    };

    readFileContent(yoloList, currentIndex, (content) => setCurrentYoloContent(content ? content.split('\n').filter(line => line.trim() !== '').join('\n') : ''));
    
    readFileContent(jsonList, currentIndex, (content) => {
      const parsed = parseJsonContent(content);
      setCurrentJsonContent(stringifyJsonContent(parsed));
    });

  }, [currentIndex, pngList, yoloList, jsonList, parseJsonContent, stringifyJsonContent]);

  useEffect(() => {
    if (currentPng) {
      setRedrawTrigger(prev => prev + 1);
    }
  }, [currentPng]);

  const loadCurrentYoloContentToCanvas = useCallback((yoloContent: string | null) => {
    const canvas = canvasRef.current; if (!canvas || !yoloContent) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const parseYoloContentToAbsolute = (relativeContent: string | null): string[] => {
      if (!relativeContent || !canvasRef.current || canvasRef.current.width === 0) return [];
      const canvas = canvasRef.current; const absoluteArray: string[] = [];
      relativeContent.split('\n').filter(Boolean).forEach(line => {
        const parts = line.split(' ').map(parseFloat); if (parts.length < 5 || parts.some(isNaN)) return;
        const [classIndex, relX, relY, relW, relH] = parts;
        const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
        const absRight = (relX + relW / 2) * canvas.width, absBottom = (relY + relH / 2) * canvas.height;
        const color = indexClassColorMapState[classIndex]?.color || '#808080';
        absoluteArray.push(`${color} ${absLeft} ${absTop} ${absRight} ${absBottom}`);
      });
      return absoluteArray;
    };
    parseYoloContentToAbsolute(yoloContent).forEach(item => {
      const [color, ...coords] = item.split(' ');
      const [left, top, right, bottom] = coords.map(parseFloat);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.rect(left, top, right - left, bottom - top); ctx.stroke();
    });
  }, [indexClassColorMapState]);
  
  const addRectNameToYoloContent = useCallback((content: string | null): string => {
    if (!content) return '';
    const classCounterMap = new Map<string, number>();
    return content.split('\n').filter(Boolean).map(line => {
      const parts = line.split(' '); const classIndexStr = parts[0];
      const classIndex = parseInt(classIndexStr, 10);
      const classCounter = classCounterMap.get(classIndexStr) || 0;
      classCounterMap.set(classIndexStr, classCounter + 1);
      const classLabel = indexClassColorMapState[classIndex]?.label || `class${classIndexStr}`;
      return `${classLabel}_${classCounter} ${line}`;
    }).join('\n');
  }, [indexClassColorMapState]);

  const loadCurrentJsonContentToCanvas = useCallback((jsonContent: string | null) => {
    const canvas = canvasRef.current; if (!canvas || !jsonContent || !currentYoloContent) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const parsedJson = parseJsonContent(jsonContent);
    if (!parsedJson.local) return;
    const namedYoloMap = new Map(addRectNameToYoloContent(currentYoloContent).split('\n').map(line => {
      const [name, ...rest] = line.split(' '); return [name, rest.join(' ')];
    }));
    Object.entries(parsedJson.local).forEach(([, nameMap]) => {
      if (nameMap && typeof nameMap === 'object') {
        Object.entries(nameMap).forEach(([name, boxNamesArray]) => {
          const color = jsonNameColorMap[name];
          if (!color || !Array.isArray(boxNamesArray)) return;
          boxNamesArray.forEach(boxName => {
            const yoloData = namedYoloMap.get(boxName); if (!yoloData) return;
            const [, relX, relY, relW, relH] = yoloData.split(' ').map(parseFloat);
            const absW = relW * canvas.width, absH = relH * canvas.height;
            const absX = (relX * canvas.width) - absW / 2, absY = (relY * canvas.height) - absH / 2;
            ctx.fillStyle = color; ctx.globalAlpha = 0.3;
            ctx.fillRect(absX, absY, absW, absH); ctx.globalAlpha = 1.0;
          });
        });
      }
    });
  }, [currentYoloContent, parseJsonContent, addRectNameToYoloContent]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (currentPng) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width; canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        loadCurrentYoloContentToCanvas(currentYoloContent);
        loadCurrentJsonContentToCanvas(currentJsonContent);
      };
      img.src = URL.createObjectURL(currentPng);
      return () => URL.revokeObjectURL(img.src);
    } else {
      if (canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = "#e0e8f0"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0050b3"; ctx.textAlign = "center";
        ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
      }
    }
  }, [redrawTrigger, currentPng, currentYoloContent, currentJsonContent, t.noImages, loadCurrentYoloContentToCanvas, loadCurrentJsonContentToCanvas]);

  useEffect(() => {
    const data = globalList[currentIndex];
    setNodeName(data?.nodeName || '');
    setNodePropertiesKeys(data?.nodePropertiesKeys || []);
    setNodePropertiesValues(data?.nodePropertiesValues || []);
  }, [currentIndex, globalList]);

  const handleLeftSiderResize = useCallback((e: globalThis.MouseEvent) => {
    if (isResizingLeftSider) {
      const newWidth = e.clientX;
      if (newWidth > 200 && newWidth < 600) {
        setLeftSiderActualWidth(newWidth);
      }
    }
  }, [isResizingLeftSider]);

  const stopLeftSiderResizing = useCallback(() => setIsResizingLeftSider(false), []);

  useEffect(() => {
    if (isResizingLeftSider) {
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleLeftSiderResize);
      window.addEventListener('mouseup', stopLeftSiderResizing);
    } else {
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleLeftSiderResize);
      window.removeEventListener('mouseup', stopLeftSiderResizing);
      document.body.style.userSelect = '';
    };
  }, [isResizingLeftSider, handleLeftSiderResize, stopLeftSiderResizing]);

  const handleInspectorResize = useCallback((e: globalThis.MouseEvent) => {
    if (isResizingInspector) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setInspectorWidth(newWidth);
      }
    }
  }, [isResizingInspector]);

  const stopInspectorResizing = useCallback(() => setIsResizingInspector(false), []);

  useEffect(() => {
    if (isResizingInspector) {
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleInspectorResize);
      window.addEventListener('mouseup', stopInspectorResizing);
    } else {
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleInspectorResize);
      window.removeEventListener('mouseup', stopInspectorResizing);
      document.body.style.userSelect = '';
    };
  }, [isResizingInspector, handleInspectorResize, stopInspectorResizing]);

  const handleFolderUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files; if (!files) return;
    const newPngList: File[] = [], newYoloList: File[] = [], newJsonList: File[] = [];
    Array.from(files).forEach(file => {
      if (file.name.toLowerCase().includes('classes.txt')) {
        // This part is not fully type safe but acceptable for this specific use case
      } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
        newPngList.push(file);
      } else if (file.name.endsWith('.txt')) {
        newYoloList.push(file);
      } else if (file.name.endsWith('.json')) {
        newJsonList.push(file);
      }
    });
    const compareFn = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });
    setPngList(newPngList.sort(compareFn));
    setYoloList(newYoloList.sort(compareFn));
    setJsonList(newJsonList.sort(compareFn));
    setCurrentIndex(0);
  };

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    setMouseDownCoords({ x, y });
    if (isColoringMode) { handleJsonBoxClick(e); return; }
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
      ctx.beginPath(); ctx.strokeStyle = indexClassColorMapState[currentClassIndex]?.color || 'black'; ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.rect(mouseDownCoords.x, mouseDownCoords.y, currentX - mouseDownCoords.x, currentY - mouseDownCoords.y);
      ctx.stroke();
      ctx.setLineDash([]);
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
      const previousYolo = currentYoloContent;

      // 关键修复：为 prev 参数添加明确类型，解决 implicit any 错误
      const newYoloContentValue = (prev: string | null) => (prev ? `${prev}\n${yoloFormatData}` : yoloFormatData);
      setCurrentYoloContent(newYoloContentValue);

      setOperationHistory(prev => [...prev, { type: 'draw', yoloData: [yoloFormatData], previousYoloContent: previousYolo }]);
      setRedoHistory([]);
    }
    setCanvasImageData(null);
    setRedrawTrigger(prev => prev + 1);
  };

  const handleJsonBoxClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isColoringMode || !selectedJsonName || !selectedJsonType) return;
    const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const namedYoloLines = addRectNameToYoloContent(currentYoloContent).split('\n');
    for (const line of namedYoloLines) {
      const [boxName, ...rest] = line.split(' '); const yoloData = rest.join(' ');
      const [, x, y, w, h] = yoloData.split(' ').map(parseFloat);
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) continue;
      const boxX = x * canvas.width, boxY = y * canvas.height;
      const boxW = w * canvas.width, boxH = h * canvas.height;
      const left = boxX - boxW/2, top = boxY - boxH/2;
      if (mouseX >= left && mouseX <= left + boxW && mouseY >= top && mouseY <= top + boxH) {
        const previousJson = currentJsonContent;
        const newJson = stringifyJsonContent((() => {
          const jsonObj = parseJsonContent(currentJsonContent);
          const targetDict = jsonObj.local[selectedJsonType!];
          if (!targetDict[selectedJsonName]) targetDict[selectedJsonName] = [];
          if (!targetDict[selectedJsonName].includes(boxName)) targetDict[selectedJsonName].push(boxName);
          return jsonObj;
        })());
        setCurrentJsonContent(newJson);
        setOperationHistory(prev => [...prev, { type: 'stain', boxName, jsonType: selectedJsonType!, jsonName: selectedJsonName, previousJsonContent: previousJson }]);
        setRedoHistory([]);
        setRedrawTrigger(p => p + 1);
        break;
      }
    }
  };

  const handleUndo = () => {
    if (operationHistory.length === 0) { message.info(t.noUndoOperations); return; }
    const lastOperation = operationHistory[operationHistory.length - 1];
    const currentStateSnapshotForRedo: Operation = lastOperation.type === 'draw' ? { ...lastOperation, previousYoloContent: currentYoloContent } :
        (lastOperation.type === 'stain' ) ? { ...lastOperation, previousJsonContent: currentJsonContent } :
          lastOperation.type === 'delete' ? { ...lastOperation, previousYoloContent: currentYoloContent } :
            lastOperation;
    setRedoHistory(prev => [currentStateSnapshotForRedo, ...prev]);
    setOperationHistory(prev => prev.slice(0, -1));
    if (lastOperation.type === 'draw') setCurrentYoloContent(lastOperation.previousYoloContent);
    else if (lastOperation.type === 'stain') setCurrentJsonContent(lastOperation.previousJsonContent);
    else if (lastOperation.type === 'delete') setCurrentYoloContent(lastOperation.previousYoloContent);
    setRedrawTrigger(p => p + 1);
    message.success(t.operationSuccessful);
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) { message.info(t.noRedoOperations); return; }
    const operationToRedo = redoHistory[0];
    const currentStateSnapshotForUndo: Operation = operationToRedo.type === 'draw' ? { ...operationToRedo, previousYoloContent: currentYoloContent } :
        (operationToRedo.type === 'stain') ? { ...operationToRedo, previousJsonContent: currentJsonContent } :
          operationToRedo.type === 'delete' ? { ...operationToRedo, previousYoloContent: currentYoloContent } :
            operationToRedo;
    setOperationHistory(prev => [...prev, currentStateSnapshotForUndo]);
    setRedoHistory(prev => prev.slice(1));
    if (operationToRedo.type === 'draw') {
      const newContent = operationToRedo.previousYoloContent ? `${operationToRedo.previousYoloContent}\n${operationToRedo.yoloData.join('\n')}`.trim() : operationToRedo.yoloData.join('\n');
      setCurrentYoloContent(newContent);
    } else if (operationToRedo.type === 'stain') {
      const { boxName, jsonType, jsonName } = operationToRedo;
      const jsonObj = parseJsonContent(currentJsonContent);
      const targetDict = jsonObj.local[jsonType];
      if (!targetDict[jsonName]) targetDict[jsonName] = [];
      if (!targetDict[jsonName].includes(boxName)) targetDict[jsonName].push(boxName);
      setCurrentJsonContent(stringifyJsonContent(jsonObj));
    } else if (operationToRedo.type === 'delete' && operationToRedo.previousYoloContent) {
      const linesAfterDelete = operationToRedo.previousYoloContent.split('\n').filter((line, idx) => {
        return !operationToRedo.deletedLines.some(del => del.index === idx && del.content === line);
      }).join('\n');
      setCurrentYoloContent(linesAfterDelete || "");
    }
    setRedrawTrigger(p => p + 1);
    message.success(t.operationSuccessful);
  };

  const handleDeleteBox = () => {
    const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return;
    const yoloLines = currentYoloContent.split('\n').filter(Boolean);
    let deletedSomething = false;
    const linesToKeep: string[] = [];
    const deletedLinesInfo: { index: number; content: string }[] = [];
    const previousYoloContentForUndo = currentYoloContent;
    yoloLines.forEach((line, index) => {
      const parts = line.split(' ').map(parseFloat);
      if (parts.length < 5) { linesToKeep.push(line); return; }
      const [ , relX, relY, relW, relH] = parts;
      const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
      const absW = relW * canvas.width, absH = relH * canvas.height;
      if (mouseDownCoords.x >= absLeft && mouseDownCoords.x <= absLeft + absW && mouseDownCoords.y >= absTop && mouseDownCoords.y <= absTop + absH) {
        deletedLinesInfo.push({ index: index, content: line });
        deletedSomething = true;
      } else {
        linesToKeep.push(line);
      }
    });
    if (deletedSomething) {
      setCurrentYoloContent(linesToKeep.join('\n'));
      setOperationHistory(prev => [...prev, { type: 'delete', deletedLines: deletedLinesInfo, previousYoloContent: previousYoloContentForUndo }]);
      setRedoHistory([]);
      message.success('成功删除标注框');
      setRedrawTrigger(p => p + 1);
    } else {
      message.info('未选中任何框，请先单击要删除的框内区域');
    }
  };

  const selectCurrentClassByIndex = (classIndex: number) => setCurrentClassIndex(classIndex);
  const handleAddNodeProperty = () => { setNodePropertiesKeys([...nodePropertiesKeys, '']); setNodePropertiesValues([...nodePropertiesValues, '']); };
  const handleUpdateNodeProperty = (index: number, field: 'key' | 'value', value: string) => {
    if (field === 'key') setNodePropertiesKeys(nodePropertiesKeys.map((k, i) => i === index ? value : k));
    else setNodePropertiesValues(nodePropertiesValues.map((v, i) => i === index ? value : v));
  };
  const removeNodeProperty = (index: number) => {
    setNodePropertiesKeys(nodePropertiesKeys.filter((_, i) => i !== index));
    setNodePropertiesValues(nodePropertiesValues.filter((_, i) => i !== index));
  };
  const handleCreateNode = async () => { /* API calls */ };

  const saveCurrentFileState = useCallback(async (indexToSave: number) => {
    if (!pngList[indexToSave]) return;
    if (currentYoloContent !== null) {
      const newYoloFile = new File([currentYoloContent], `${getFileNameWithoutExtension(pngList[indexToSave].name)}.txt`, { type: 'text/plain' });
      setYoloList(prev => { const n = [...prev]; n[indexToSave] = newYoloFile; return n; });
    }
    if (currentJsonContent !== null) {
      const newJsonFile = new File([currentJsonContent], `${getFileNameWithoutExtension(pngList[indexToSave].name)}.json`, { type: 'application/json' });
      setJsonList(prev => { const n = [...prev]; n[indexToSave] = newJsonFile; return n; });
    }
    setGlobalList(prev => ({ ...prev, [indexToSave]: { nodeName, nodePropertiesKeys, nodePropertiesValues } }));
  }, [pngList, currentYoloContent, currentJsonContent, nodeName, nodePropertiesKeys, nodePropertiesValues]);

  const handleNextIndex = useCallback(() => { if (currentIndex < pngList.length - 1) { saveCurrentFileState(currentIndex); setCurrentIndex(p => p + 1); } }, [currentIndex, pngList.length, saveCurrentFileState]);
  const handlePrevIndex = useCallback(() => { if (currentIndex > 0) { saveCurrentFileState(currentIndex); setCurrentIndex(p => p - 1); } }, [currentIndex, saveCurrentFileState]);

  const handleSaveAllToZip = async () => {
    if (pngList.length === 0) { message.warning(t.noFile); return; }
    message.loading({ content: "正在准备数据并打包...", key: "exporting", duration: 0 });
    const zip = new JSZip();
    for (let i = 0; i < pngList.length; i++) {
      const pngFile = pngList[i];
      const baseName = getFileNameWithoutExtension(pngFile.name);
      let yoloContentForFile: string, jsonContentForFile: string;
      if (i === currentIndex) {
        yoloContentForFile = currentYoloContent || "";
        jsonContentForFile = currentJsonContent || "{}";
      } else {
        const yoloFile = yoloList[i];
        const jsonFile = jsonList[i];
        yoloContentForFile = yoloFile ? await yoloFile.text() : "";
        const rawJsonContent = jsonFile ? await jsonFile.text() : null;
        jsonContentForFile = stringifyJsonContent(parseJsonContent(rawJsonContent));
      }
      zip.file(`yolo/${baseName}.txt`, yoloContentForFile);
      zip.file(`json/${baseName}.json`, jsonContentForFile);
      zip.file(`images/${pngFile.name}`, pngFile);
    }
    zip.generateAsync({ type: 'blob' }).then(content => {
      saveAs(content, 'fileoperate_annotations.zip');
      message.success({content: "所有文件已打包下载", key:"exporting", duration: 2});
    }).catch(err => {
      message.error({content: `导出失败: ${err.message}`, key:"exporting", duration: 2});
    });
  };
  
  return (
    <Layout className="file-operate-layout">
      <Sider width={leftSiderActualWidth} className="file-operate-tool-sider" theme="light" collapsible={false}>
        <Tabs defaultActiveKey="1" className="sider-tabs" centered>
          <TabPane tab={<Tooltip title={t.fileManagement}><FontAwesomeIcon icon={faFolderOpen} /></Tooltip>} key="1">
            <div className="tab-pane-content">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Button type="primary" onClick={() => document.getElementById('folder-upload-input-fileoperate')?.click()} icon={<FontAwesomeIcon icon={faUpload} />} block>{t.uploadFolder}</Button>
                <input type="file" {...{ webkitdirectory: "true", directory: "true" }} multiple onChange={handleFolderUpload} style={{ display: 'none' }} id="folder-upload-input-fileoperate" />
                <Space.Compact style={{ width: '100%' }}>
                  <Button onClick={handlePrevIndex} disabled={currentIndex === 0} icon={<FontAwesomeIcon icon={faArrowLeft} />} style={{ flex: 1 }} />
                  <InputNumber min={1} max={pngList.length || 1} value={currentIndex + 1}
                               onChange={(value) => { if (value !== null && value >= 1 && value <= pngList.length) { saveCurrentFileState(currentIndex); setCurrentIndex(value - 1); } }}
                               style={{ width: '100%', textAlign: 'center', flex: 2 }}
                               disabled={pngList.length === 0}
                  />
                  <Button onClick={handleNextIndex} disabled={currentIndex >= pngList.length - 1} icon={<FontAwesomeIcon icon={faArrowRight} />} style={{ flex: 1 }} />
                </Space.Compact>
                <Text type="secondary" style={{ textAlign: 'center', display: 'block', wordBreak: 'break-all' }}>{t.currentFile}: {currentPng?.name || 'N/A'} ({currentIndex + 1} / {pngList.length})</Text>
              </Space>
            </div>
          </TabPane>
          <TabPane tab={<Tooltip title={t.annotationTools}><FontAwesomeIcon icon={faPaintBrush} /></Tooltip>} key="2">
            <div className="tab-pane-content">
              <Form layout="vertical">
                <Form.Item label={t.category}>
                  <Select value={currentClassIndex} onChange={selectCurrentClassByIndex} style={{ width: '100%' }}>
                    {/* 关键修复：由于 `constants.ts` 提供了类型，这里的 `color` 和 `label` 属性可以被正确推断，不再报错 */}
                    {Object.entries(indexClassColorMapState).map(([idx, { color, label }]) => (
                      <Option key={idx} value={parseInt(idx)}>
                        <Space><div style={{ width: '16px', height: '16px', backgroundColor: color, borderRadius: '3px', border: '1px solid #ccc' }} />{`[${idx}] ${label}`}</Space>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item>
                  <Button onClick={() => setIsColoringMode(!isColoringMode)} type={isColoringMode ? 'primary' : 'default'} ghost={isColoringMode} icon={isColoringMode ? <FontAwesomeIcon icon={faEye} /> : <FontAwesomeIcon icon={faPen} />} block>
                    {isColoringMode ? t.coloringMode : t.drawingMode}
                  </Button>
                </Form.Item>
                <Form.Item label={t.chooseJsonName}>
                  <Select placeholder={t.chooseJsonName} value={selectedJsonName} onChange={setSelectedJsonName} style={{ width: '100%' }} disabled={!isColoringMode}>
                    {Object.keys(jsonNameColorMap).map(name => <Option key={name} value={name}>{name}</Option>)}
                  </Select>
                </Form.Item>
                <Form.Item label={t.chooseJsonType}>
                  <Select placeholder={t.chooseJsonType} value={selectedJsonType} onChange={(v) => setSelectedJsonType(v as any)} style={{ width: '100%' }} disabled={!isColoringMode}>
                    <Option key="buildingBlocks" value="buildingBlocks">Building Blocks</Option>
                    <Option key="constants" value="constants">Constants</Option>
                  </Select>
                </Form.Item>
              </Form>
            </div>
          </TabPane>
          <TabPane tab={<Tooltip title={t.actions}><FontAwesomeIcon icon={faHistory} /></Tooltip>} key="3">
            <div className="tab-pane-content">
              <Space direction="vertical" style={{width: '100%'}} size="middle">
                <Button onClick={handleUndo} icon={<FontAwesomeIcon icon={faUndo} />} block disabled={operationHistory.length === 0}>{t.undo}</Button>
                <Button onClick={handleRedo} icon={<FontAwesomeIcon icon={faRedo} />} block disabled={redoHistory.length === 0}>{t.redo}</Button>
                <Button onClick={handleDeleteBox} icon={<FontAwesomeIcon icon={faTrash} />} block danger>{t.deleteBox}</Button>
                <Button onClick={handleSaveAllToZip} icon={<FontAwesomeIcon icon={faSave} />} block type="primary">{t.saveAll}</Button>
              </Space>
            </div>
          </TabPane>
          <TabPane tab={<Tooltip title={t.function}><FontAwesomeIcon icon={faTag} /></Tooltip>} key="4">
            <div className="tab-pane-content">
              <Form layout="vertical">
                <Form.Item label={t.nodeName}>
                  <Input value={nodeName} onChange={(e) => setNodeName(e.target.value)} />
                </Form.Item>
                {nodePropertiesKeys.map((key, index) => (
                  <Form.Item key={index} label={`${t.key} ${index + 1}`}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input placeholder={t.key} value={key} onChange={(e) => handleUpdateNodeProperty(index, 'key', e.target.value)} />
                      <Input placeholder={t.value} value={nodePropertiesValues[index]} onChange={(e) => handleUpdateNodeProperty(index, 'value', e.target.value)} />
                      <Tooltip title={t.delete}><Button onClick={() => removeNodeProperty(index)} icon={<FontAwesomeIcon icon={faMinusCircle} />} danger /></Tooltip>
                    </Space.Compact>
                  </Form.Item>
                ))}
                <Button onClick={handleAddNodeProperty} icon={<FontAwesomeIcon icon={faPlus} />} block>{t.addProperty}</Button>
                <Button onClick={handleCreateNode} type="primary" ghost block style={{marginTop: '16px'}}>{t.addNode}</Button>
              </Form>
            </div>
          </TabPane>
        </Tabs>
      </Sider>
      <div className="resizer-horizontal" onMouseDown={() => setIsResizingLeftSider(true)} />
      <Layout className="file-operate-main-content-layout">
        <Content className="file-operate-canvas-content">
          <div className={`file-operate-canvas-wrapper ${isColoringMode ? 'coloring-mode' : ''}`}>
            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />
          </div>
        </Content>
      </Layout>
      <div className="resizer-horizontal" onMouseDown={() => setIsResizingInspector(true)} style={{display: isInspectorVisible ? 'flex' : 'none'}} />
      <Sider width={isInspectorVisible ? inspectorWidth : 0} className="file-operate-inspector-sider" theme="light" collapsible collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
        {isInspectorVisible && (
          <Card title={<Space><FontAwesomeIcon icon={faList}/>{t.dataExplorer}</Space>}
                extra={<Tooltip title={isInspectorVisible ? "隐藏面板" : "显示面板"}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(!isInspectorVisible)} /></Tooltip>}
                style={{height: '100%', display:'flex', flexDirection:'column', borderLeft: 'none'}}
                headStyle={{borderBottom: '1px solid var(--border-color-light)', padding: '0 16px', flexShrink: 0}}
                bodyStyle={{flexGrow: 1, overflow:'auto', padding: '16px'}}
          >
            <Typography.Title level={5}>YOLO Data</Typography.Title>
            <textarea
              value={currentYoloContent ? addRectNameToYoloContent(currentYoloContent) : ""}
              className="yolo-content-textarea"
              readOnly
              style={{height: 'calc(50% - 25px - 10px)', marginBottom: '10px', width: '100%'}}
            />
            <Typography.Title level={5}>JSON Data</Typography.Title>
            <textarea
              value={currentJsonContent || "{}"}
              className="yolo-content-textarea"
              readOnly
              style={{height: 'calc(50% - 25px)', width: '100%'}}
            />
          </Card>
        )}
      </Sider>
    </Layout>
  );
};

export default FileOperate;