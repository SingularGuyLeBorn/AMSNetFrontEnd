import React, { useState, useRef, useEffect, ChangeEvent, MouseEvent, useCallback } from 'react';
import {
    Layout,
    Tabs,
    Button,
    Space,
    InputNumber,
    Typography,
    Select,
    Form,
    Input,
    Tooltip,
    message,
    Card,
    List,
    Radio,
    Divider,
    Flex
} from 'antd';
import { useModel } from "@umijs/max";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faUpload, faSave, faUndo, faRedo, faTrash,
    faArrowLeft, faArrowRight, faTag, faPaintBrush, faPlus,
    faPen, faList, faEye, faMinusCircle,
    faChevronLeft, faChevronRight, faRobot, faCogs, faTags, faFileImport, faFileExport
} from "@fortawesome/free-solid-svg-icons";
import { jsonNameColorMap, translations, ClassInfo, Operation } from './constants';
import './index.css';

const { Option } = Select;
const { Title, Text } = Typography;
const { Sider, Content, Header } = Layout;
const { TabPane } = Tabs;

interface JsonData {
    local: {
        buildingBlocks: { [key: string]: string[] };
        constants: { [key: string]: string[] };
    };
    global: { [key: string]: any };
}

const getFileNameWithoutExtension = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) return fileName;
    return fileName.substring(0, lastDotIndex);
};

const generateRandomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

const FileOperate: React.FC = () => {
    const { initialState } = useModel('@@initialState');
    const {
        file_classMap: classMap, setFile_classMap: setClassMap,
        file_pngList: pngList, setFile_pngList: setPngList,
        file_yoloList: yoloList, setFile_yoloList: setYoloList,
        file_jsonList: jsonList, setFile_jsonList: setJsonList,
        file_currentIndex: currentIndex, setFile_currentIndex: setCurrentIndex,
        file_currentYoloContent: currentYoloContent, setFile_currentYoloContent: setCurrentYoloContent,
        file_currentJsonContent: currentJsonContent, setFile_currentJsonContent: setCurrentJsonContent,
        file_operationHistory: operationHistory, setFile_operationHistory: setOperationHistory,
        file_redoHistory: redoHistory, setFile_redoHistory: setRedoHistory,
    } = useModel('annotationStore');

    const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
    const t = translations[currentLang];

    const [currentPng, setCurrentPng] = useState<File | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [currentClassIndex, setCurrentClassIndex] = useState<number>(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [mouseDownCoords, setMouseDownCoords] = useState({ x: 0, y: 0 });
    const [canvasImageData, setCanvasImageData] = useState<ImageData | null>(null);
    const [selectedJsonName, setSelectedJsonName] = useState<string | null>(null);
    const [selectedJsonType, setSelectedJsonType] = useState<'buildingBlocks' | 'constants' | null>(null);
    const [isColoringMode, setIsColoringMode] = useState(false);
    const [redrawTrigger, setRedrawTrigger] = useState(0);
    const [leftSiderWidth, setLeftSiderWidth] = useState(300);
    const [isResizingLeftSider, setIsResizingLeftSider] = useState(false);
    const [inspectorWidth, setInspectorWidth] = useState(320);
    const [isResizingInspector, setIsResizingInspector] = useState(false);
    const [isInspectorVisible, setIsInspectorVisible] = useState(true);
    const [isAiAnnotating, setIsAiAnnotating] = useState(false);
    const [apiMode, setApiMode] = useState<'auto' | 'manual'>('auto');
    const [manualApiEndpoint, setManualApiEndpoint] = useState<'new' | 'incremental'>('new');
    const classImportRef = useRef<HTMLInputElement>(null);
    const saveOnUnmountRef = useRef<() => void>();

    useEffect(() => {
        setCurrentLang(initialState?.language || 'zh');
    }, [initialState?.language]);

    const stringifyJsonContent = useCallback((jsonObj: JsonData): string => {
        return JSON.stringify(jsonObj, null, 2);
    }, []);

    const parseJsonContent = useCallback((jsonContent: string | null): JsonData => {
        try {
            // 为什么？健壮性设计。此函数能处理 null、空字符串或无效JSON，确保总能返回一个有效的默认对象结构。
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

    const saveCurrentFileState = useCallback(async (indexToSave: number) => {
        if (!pngList[indexToSave]) return;
        if (currentYoloContent !== null) {
            const newYoloFile = new File([currentYoloContent], `${getFileNameWithoutExtension(pngList[indexToSave].name)}.txt`, { type: 'text/plain' });
            setYoloList(prev => {
                const n = [...prev];
                n[indexToSave] = newYoloFile;
                return n;
            });
        }
        if (currentJsonContent !== null) {
            const newJsonFile = new File([currentJsonContent], `${getFileNameWithoutExtension(pngList[indexToSave].name)}.json`, { type: 'application/json' });
            setJsonList(prev => {
                const n = [...prev];
                n[indexToSave] = newJsonFile;
                return n;
            });
        }
    }, [pngList, currentYoloContent, currentJsonContent, setYoloList, setJsonList]);

    useEffect(() => {
        saveOnUnmountRef.current = () => saveCurrentFileState(currentIndex);
    });

    useEffect(() => {
        return () => {
            if (saveOnUnmountRef.current) {
                saveOnUnmountRef.current();
            }
        };
    }, []);

    useEffect(() => {
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

    }, [currentIndex, pngList, yoloList, jsonList, parseJsonContent, stringifyJsonContent, setCurrentYoloContent, setCurrentJsonContent]);

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
                const color = classMap[classIndex]?.color || '#808080';
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
    }, [classMap]);

    const addRectNameToYoloContent = useCallback((content: string | null): string => {
        if (!content) return '';
        const classCounterMap = new Map<string, number>();
        return content.split('\n').filter(Boolean).map(line => {
            const parts = line.split(' '); const classIndexStr = parts[0];
            const classIndex = parseInt(classIndexStr, 10);
            const classCounter = classCounterMap.get(classIndexStr) || 0;
            classCounterMap.set(classIndexStr, classCounter + 1);
            const classLabel = classMap[classIndex]?.label || `class_${classIndexStr}`;
            return `${classLabel}_${classCounter} ${line}`;
        }).join('\n');
    }, [classMap]);

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
    }, [currentYoloContent, parseJsonContent, addRectNameToYoloContent, classMap]);

    useEffect(() => {
        if (currentPng) {
            setRedrawTrigger(prev => prev + 1);
        }
    }, [currentPng]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (currentPng) {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                loadCurrentYoloContentToCanvas(currentYoloContent);
                loadCurrentJsonContentToCanvas(currentJsonContent);
            };
            img.src = URL.createObjectURL(currentPng);
            return () => URL.revokeObjectURL(img.src);
        } else if (canvas.width > 0 && canvas.height > 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#e0e8f0";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = "bold 20px Arial";
            ctx.fillStyle = "#0050b3";
            ctx.textAlign = "center";
            ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
        }

    }, [redrawTrigger, currentPng, currentYoloContent, currentJsonContent, t.noImages, loadCurrentYoloContentToCanvas, loadCurrentJsonContentToCanvas]);

    const handleLeftSiderResize = useCallback((e: globalThis.MouseEvent) => { if (isResizingLeftSider) { const newWidth = e.clientX; if (newWidth > 200 && newWidth < 600) { setLeftSiderWidth(newWidth); } } }, [isResizingLeftSider]);
    const stopLeftSiderResizing = useCallback(() => setIsResizingLeftSider(false), []);
    useEffect(() => { if (isResizingLeftSider) { document.body.style.userSelect = 'none'; window.addEventListener('mousemove', handleLeftSiderResize); window.addEventListener('mouseup', stopLeftSiderResizing); } else { document.body.style.userSelect = ''; } return () => { window.removeEventListener('mousemove', handleLeftSiderResize); window.removeEventListener('mouseup', stopLeftSiderResizing); document.body.style.userSelect = ''; }; }, [isResizingLeftSider, handleLeftSiderResize, stopLeftSiderResizing]);
    const handleInspectorResize = useCallback((e: globalThis.MouseEvent) => { if (isResizingInspector) { const newWidth = window.innerWidth - e.clientX; if (newWidth > 200 && newWidth < 800) { setInspectorWidth(newWidth); } } }, [isResizingInspector]);
    const stopInspectorResizing = useCallback(() => setIsResizingInspector(false), []);
    useEffect(() => { if (isResizingInspector) { document.body.style.userSelect = 'none'; window.addEventListener('mousemove', handleInspectorResize); window.addEventListener('mouseup', stopInspectorResizing); } else { document.body.style.userSelect = ''; } return () => { window.removeEventListener('mousemove', handleInspectorResize); window.removeEventListener('mouseup', stopInspectorResizing); document.body.style.userSelect = ''; }; }, [isResizingInspector, handleInspectorResize, stopInspectorResizing]);

    const handleFolderUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files; if (!files) return;
        const newPngList: File[] = [], newYoloList: File[] = [], newJsonList: File[] = [];
        Array.from(files).forEach(file => {
            if (file.type === 'image/png' || file.type === 'image/jpeg') newPngList.push(file);
            else if (file.name.endsWith('.txt')) newYoloList.push(file);
            else if (file.name.endsWith('.json')) newJsonList.push(file);
        });
        const compareFn = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });
        setPngList(newPngList.sort(compareFn));
        setYoloList(newYoloList.sort(compareFn));
        setJsonList(newJsonList.sort(compareFn));
        setCurrentIndex(0);
        setOperationHistory({});
        setRedoHistory({});
    };

    const handleJsonBoxClick = (e: MouseEvent<HTMLCanvasElement>) => { if (!isColoringMode || !selectedJsonName || !selectedJsonType) return; const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return; const rect = canvas.getBoundingClientRect(); const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top; const namedYoloLines = addRectNameToYoloContent(currentYoloContent).split('\n'); for (const line of namedYoloLines) { const [boxName, ...rest] = line.split(' '); const yoloData = rest.join(' '); const [, x, y, w, h] = yoloData.split(' ').map(parseFloat); if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) continue; const boxX = x * canvas.width, boxY = y * canvas.height; const boxW = w * canvas.width, boxH = h * canvas.height; const left = boxX - boxW / 2, top = boxY - boxH / 2; if (mouseX >= left && mouseX <= left + boxW && mouseY >= top && mouseY <= top + boxH) { const previousJson = currentJsonContent; const newJson = stringifyJsonContent((() => { const jsonObj = parseJsonContent(currentJsonContent); const targetDict = jsonObj.local[selectedJsonType!]; if (!targetDict[selectedJsonName]) targetDict[selectedJsonName] = []; if (!targetDict[selectedJsonName].includes(boxName)) targetDict[selectedJsonName].push(boxName); return jsonObj; })()); setCurrentJsonContent(newJson);
        const newOp: Operation = { type: 'stain', boxName, jsonType: selectedJsonType, jsonName: selectedJsonName, previousJsonContent: previousJson };
        setOperationHistory(prev => {
            const newHistory = { ...prev };
            const currentImageHistory = prev[currentIndex] || [];
            newHistory[currentIndex] = [...currentImageHistory, newOp];
            return newHistory;
        });
        setRedoHistory(prev => {
            const newRedoHistory = { ...prev };
            newRedoHistory[currentIndex] = [];
            return newRedoHistory;
        });
        setRedrawTrigger(p => p + 1); break; } }
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
            ctx.beginPath(); ctx.strokeStyle = classMap[currentClassIndex]?.color || 'black'; ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.rect(mouseDownCoords.x, mouseDownCoords.y, currentX - mouseDownCoords.x, currentY - mouseDownCoords.y);
            ctx.stroke(); ctx.setLineDash([]);
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
            const newYoloContentValue = (prev: string | null) => (prev ? `${prev}\n${yoloFormatData}` : yoloFormatData);
            setCurrentYoloContent(newYoloContentValue);
            const newOp: Operation = { type: 'draw', yoloData: [yoloFormatData], previousYoloContent: previousYolo };
            setOperationHistory(prev => {
                const newHistory = { ...prev };
                const currentImageHistory = prev[currentIndex] || [];
                newHistory[currentIndex] = [...currentImageHistory, newOp];
                return newHistory;
            });
            setRedoHistory(prev => {
                const newRedoHistory = { ...prev };
                newRedoHistory[currentIndex] = [];
                return newRedoHistory;
            });
        }
        setCanvasImageData(null);
        setRedrawTrigger(prev => prev + 1);
    };

    const handleUndo = () => {
        const currentImageHistory = operationHistory[currentIndex] || [];
        if (currentImageHistory.length === 0) {
            message.info(t.noUndoOperations);
            return;
        }

        const lastOperation = currentImageHistory[currentImageHistory.length - 1];

        const currentStateSnapshotForRedo: Operation = lastOperation.type === 'draw' || lastOperation.type === 'ai_annotate'
            ? { ...lastOperation, previousYoloContent: currentYoloContent }
            : (lastOperation.type === 'stain')
                ? { ...lastOperation, previousJsonContent: currentJsonContent }
                : lastOperation.type === 'delete'
                    ? { ...lastOperation, previousYoloContent: currentYoloContent }
                    : lastOperation;

        setRedoHistory(prev => {
            const newRedoHistory = { ...prev };
            const currentImageRedoHistory = prev[currentIndex] || [];
            newRedoHistory[currentIndex] = [currentStateSnapshotForRedo, ...currentImageRedoHistory];
            return newRedoHistory;
        });

        setOperationHistory(prev => {
            const newHistory = { ...prev };
            newHistory[currentIndex] = currentImageHistory.slice(0, -1);
            return newHistory;
        });

        if (lastOperation.type === 'draw' || lastOperation.type === 'ai_annotate' || lastOperation.type === 'delete') {
            setCurrentYoloContent(lastOperation.previousYoloContent);
        } else if (lastOperation.type === 'stain') {
            setCurrentJsonContent(lastOperation.previousJsonContent);
        }

        setRedrawTrigger(p => p + 1);
        message.success(t.operationSuccessful);
    };

    const handleRedo = () => {
        const currentImageRedoHistory = redoHistory[currentIndex] || [];
        if (currentImageRedoHistory.length === 0) {
            message.info(t.noRedoOperations);
            return;
        }

        const operationToRedo = currentImageRedoHistory[0];

        const currentStateSnapshotForUndo: Operation = operationToRedo.type === 'draw' || operationToRedo.type === 'ai_annotate'
            ? { ...operationToRedo, previousYoloContent: currentYoloContent }
            : (operationToRedo.type === 'stain')
                ? { ...operationToRedo, previousJsonContent: currentJsonContent }
                : operationToRedo.type === 'delete'
                    ? { ...operationToRedo, previousYoloContent: currentYoloContent }
                    : operationToRedo;

        setOperationHistory(prev => {
            const newHistory = { ...prev };
            const currentImageHistory = prev[currentIndex] || [];
            newHistory[currentIndex] = [...currentImageHistory, currentStateSnapshotForUndo];
            return newHistory;
        });
        setRedoHistory(prev => {
            const newRedoHistory = { ...prev };
            newRedoHistory[currentIndex] = currentImageRedoHistory.slice(1);
            return newRedoHistory;
        });

        if (operationToRedo.type === 'draw' || operationToRedo.type === 'ai_annotate') {
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
            const linesAfterDelete = operationToRedo.previousYoloContent.split('\n').filter((line, idx) => !operationToRedo.deletedLines.some(del => del.index === idx && del.content === line)).join('\n');
            setCurrentYoloContent(linesAfterDelete || "");
        }

        setRedrawTrigger(p => p + 1);
        message.success(t.operationSuccessful);
    };

    const handleDeleteBox = () => { const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return; const yoloLines = currentYoloContent.split('\n').filter(Boolean); let deletedSomething = false; const linesToKeep: string[] = []; const deletedLinesInfo: { index: number; content: string }[] = []; const previousYoloContentForUndo = currentYoloContent; yoloLines.forEach((line, index) => { const parts = line.split(' ').map(parseFloat); if (parts.length < 5) { linesToKeep.push(line); return; } const [, relX, relY, relW, relH] = parts; const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height; const absW = relW * canvas.width, absH = relH * canvas.height; if (mouseDownCoords.x >= absLeft && mouseDownCoords.x <= absLeft + absW && mouseDownCoords.y >= absTop && mouseDownCoords.y <= absTop + absH) { deletedLinesInfo.push({ index: index, content: line }); deletedSomething = true; } else { linesToKeep.push(line); } }); if (deletedSomething) { setCurrentYoloContent(linesToKeep.join('\n'));
        const newOp: Operation = { type: 'delete', deletedLines: deletedLinesInfo, previousYoloContent: previousYoloContentForUndo };
        setOperationHistory(prev => {
            const newHistory = { ...prev };
            const currentImageHistory = prev[currentIndex] || [];
            newHistory[currentIndex] = [...currentImageHistory, newOp];
            return newHistory;
        });
        setRedoHistory(prev => {
            const newRedoHistory = { ...prev };
            newRedoHistory[currentIndex] = [];
            return newRedoHistory;
        });
        message.success('成功删除标注框'); setRedrawTrigger(p => p + 1); } else { message.info('未选中任何框，请先单击要删除的框内区域'); }
    };

    const selectCurrentClassByIndex = (classIndex: number) => setCurrentClassIndex(classIndex);
    const handleNextIndex = useCallback(() => { if (currentIndex < pngList.length - 1) { saveCurrentFileState(currentIndex); setCurrentIndex(p => p + 1); } }, [currentIndex, pngList.length, saveCurrentFileState, setCurrentIndex]);
    const handlePrevIndex = useCallback(() => { if (currentIndex > 0) { saveCurrentFileState(currentIndex); setCurrentIndex(p => p - 1); } }, [currentIndex, saveCurrentFileState, setCurrentIndex]);
    
    /**
     * 【页面独立功能】处理本页面的导出操作。
     * 【核心逻辑】始终以图片列表为准，确保为每张图片都生成对应的标注文件，如果不存在则生成空文件。
     */
    const handleSaveAllToZip = async () => {
        if (pngList.length === 0) {
            message.warning(t.noFile);
            return;
        }
        // 为什么？确保当前屏幕上正在编辑但未保存（通过切换图片等操作）的数据，在导出前被写入全局状态。
        await saveCurrentFileState(currentIndex);
        message.loading({ content: "正在准备数据并打包...", key: "exporting", duration: 0 });
        
        const zip = new JSZip();
        const yoloFolder = zip.folder("yolo");
        const jsonFolder = zip.folder("json");
        const imagesFolder = zip.folder("images");

        if(!yoloFolder || !jsonFolder || !imagesFolder) {
            message.error({ content: "创建ZIP文件夹失败", key: "exporting", duration: 2 });
            return;
        }

        try {
            // 为什么？以图片列表为权威数据源进行遍历，这是确保文件完整性的基石。
            for (let i = 0; i < pngList.length; i++) {
                const pngFile = pngList[i];
                const baseName = getFileNameWithoutExtension(pngFile.name);
                
                // 确保 yolo 和 json 列表与 png 列表对齐，即使它们在某一刻可能不同步
                const yoloFile = yoloList.find(f => getFileNameWithoutExtension(f.name) === baseName);
                const jsonFile = jsonList.find(f => getFileNameWithoutExtension(f.name) === baseName);

                // 1. 添加图片文件
                imagesFolder.file(pngFile.name, pngFile);

                // 2. 添加或补全 YOLO 文件
                const yoloContentForFile = yoloFile ? await yoloFile.text() : "";
                yoloFolder.file(`${baseName}.txt`, yoloContentForFile);

                // 3. 添加或补全 JSON 文件
                // 为什么？parseJsonContent 结合 stringifyJsonContent 能优雅地处理 null/undefined/空内容，自动生成 "{}"
                const rawJsonContent = jsonFile ? await jsonFile.text() : null;
                const jsonContentForFile = stringifyJsonContent(parseJsonContent(rawJsonContent));
                jsonFolder.file(`${baseName}.json`, jsonContentForFile);
            }

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'fileoperate_annotations.zip');
            message.success({ content: "所有文件已打包下载", key: "exporting", duration: 2 });
        } catch (err: any) {
            message.error({ content: `导出失败: ${err.message}`, key: "exporting", duration: 2 });
        }
    };
    
    const mockAiApiCall = (apiType: 'new' | 'incremental'): Promise<string> => { return new Promise(resolve => { setTimeout(() => { const classIndices = Object.keys(classMap); if (classIndices.length === 0) { resolve(""); return; } let mockData = []; const numBoxes = apiType === 'new' ? Math.floor(Math.random() * 5) + 3 : Math.floor(Math.random() * 2) + 1; for (let i = 0; i < numBoxes; i++) { const classIndex = classIndices[Math.floor(Math.random() * classIndices.length)]; const w = Math.random() * 0.15 + 0.05; const h = Math.random() * 0.15 + 0.05; const x = Math.random() * (1 - w) + w / 2; const y = Math.random() * (1 - h) + h / 2; mockData.push(`${classIndex} ${x.toFixed(6)} ${y.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`); } resolve(mockData.join('\n')); }, 1500); }); };
    
    const handleAiAnnotation = async () => { if (!currentPng) { message.warning(t.noFile); return; } setIsAiAnnotating(true); const apiType = apiMode === 'auto' ? (!currentYoloContent || currentYoloContent.trim() === '' ? 'new' : 'incremental') : manualApiEndpoint; try { const aiResult = await mockAiApiCall(apiType); if (aiResult && aiResult.trim() !== '') { const previousYolo = currentYoloContent; const newYoloContent = (previousYolo ? `${previousYolo}\n${aiResult}` : aiResult).trim(); setCurrentYoloContent(newYoloContent);
        const newOp: Operation = { type: 'ai_annotate', yoloData: aiResult.split('\n'), previousYoloContent: previousYolo };
        setOperationHistory(prev => {
            const newHistory = { ...prev };
            const currentImageHistory = prev[currentIndex] || [];
            newHistory[currentIndex] = [...currentImageHistory, newOp];
            return newHistory;
        });
        setRedoHistory(prev => {
            const newRedoHistory = { ...prev };
            newRedoHistory[currentIndex] = [];
            return newRedoHistory;
        });
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful); } else { message.info("AI 未返回有效标注结果。"); } } catch (error) { message.error("AI 标注失败。"); } finally { setIsAiAnnotating(false); }
    };
    
    const handleAddClass = () => { const existingIndices = Object.keys(classMap).map(Number); const newIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0; setClassMap(prev => ({ ...prev, [newIndex]: { label: 'new_class', color: generateRandomColor() } })); };
    const handleUpdateClass = (index: number, field: 'label' | 'color', value: string) => { setClassMap(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } })); };
    const handleDeleteClass = (index: number) => { const newClassMap = { ...classMap }; delete newClassMap[index]; setClassMap(newClassMap); if (currentClassIndex === index) { setCurrentClassIndex(Object.keys(newClassMap)[0] ? parseInt(Object.keys(newClassMap)[0]) : 0); } };
    const handleExportClasses = () => { const classText = Object.values(classMap).map(c => c.label).join('\n'); const blob = new Blob([classText], { type: 'text/plain;charset=utf-8' }); saveAs(blob, 'classes.txt'); };
    const handleImportClasses = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { const text = e.target?.result as string; const labels = text.split('\n').map(l => l.trim()).filter(Boolean); const newClassMap: { [key: number]: ClassInfo } = {}; labels.forEach((label, index) => { newClassMap[index] = { label, color: generateRandomColor() }; }); setClassMap(newClassMap); setCurrentClassIndex(0); message.success(`成功导入 ${labels.length} 个类别。`); }; reader.readAsText(file); if (event.target) event.target.value = ''; };

    const currentUndoStackSize = (operationHistory[currentIndex] || []).length;
    const currentRedoStackSize = (redoHistory[currentIndex] || []).length;

    return (
        <Layout className="file-operate-layout">
            <Header className="file-operate-top-header">
                <div className="header-left-controls">
                    <Button
                        type="primary"
                        onClick={() => document.getElementById('folder-upload-input-fileoperate')?.click()}
                        icon={<FontAwesomeIcon icon={faUpload} />}
                    >
                        {t.uploadFolder}
                    </Button>
                    <input
                        type="file"
                        {...{ webkitdirectory: "true", directory: "true" } as any}
                        multiple
                        onChange={handleFolderUpload}
                        style={{ display: 'none' }}
                        id="folder-upload-input-fileoperate"
                    />
                </div>
                <div className="header-right-controls">
                    <Text className="current-file-text" title={currentPng?.name}>
                        {t.currentFile}: {currentPng?.name || 'N/A'} ({currentIndex + 1} / {pngList.length})
                    </Text>
                    <Space.Compact>
                        <Button onClick={handlePrevIndex} disabled={currentIndex === 0} icon={<FontAwesomeIcon icon={faArrowLeft} />} />
                        <InputNumber
                            min={1}
                            max={pngList.length || 1}
                            value={currentIndex + 1}
                            onChange={(value) => { if (value !== null && value >= 1 && value <= pngList.length) { saveCurrentFileState(currentIndex); setCurrentIndex(value - 1); } }}
                            style={{ width: 80, textAlign: 'center' }}
                            disabled={pngList.length === 0}
                        />
                        <Button onClick={handleNextIndex} disabled={currentIndex >= pngList.length - 1} icon={<FontAwesomeIcon icon={faArrowRight} />} />
                    </Space.Compact>
                    <Button
                        onClick={handleSaveAllToZip}
                        icon={<FontAwesomeIcon icon={faSave} />}
                        type="primary"
                        ghost
                    >
                        {t.saveAll}
                    </Button>
                </div>
            </Header>
            <Layout hasSider>
                <Sider width={leftSiderWidth} className="file-operate-tool-sider" theme="light" collapsible={false}>
                    <Tabs defaultActiveKey="1" className="sider-tabs" centered>
                        <TabPane tab={<Tooltip title={t.toolsAndActions}><FontAwesomeIcon icon={faPaintBrush} /></Tooltip>} key="1">
                            <div className="tab-pane-content">
                                <Title level={5}>{t.annotationTools}</Title>
                                <Form layout="vertical">
                                    <Form.Item label={t.category}>
                                        <Select value={currentClassIndex} onChange={selectCurrentClassByIndex} style={{ width: '100%' }}>
                                            {Object.entries(classMap).map(([idx, { color, label }]) => (
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
                                <Divider />
                                <Title level={5}>{t.actions}</Title>
                                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                                    <Button onClick={handleUndo} icon={<FontAwesomeIcon icon={faUndo} />} block disabled={currentUndoStackSize === 0}>{t.undo}</Button>
                                    <Button onClick={handleRedo} icon={<FontAwesomeIcon icon={faRedo} />} block disabled={currentRedoStackSize === 0}>{t.redo}</Button>
                                    <Button onClick={handleDeleteBox} icon={<FontAwesomeIcon icon={faTrash} />} block danger>{t.deleteBox}</Button>
                                    <Button onClick={handleAiAnnotation} icon={<FontAwesomeIcon icon={faRobot} />} block loading={isAiAnnotating} disabled={!currentPng || isAiAnnotating}>
                                        {isAiAnnotating ? t.aiAnnotating : t.aiAnnotation}
                                    </Button>
                                </Space>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.classManagement}><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2">
                            <div className="tab-pane-content">
                                <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                                    <Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title>
                                    <Space.Compact>
                                        <Tooltip title={t.importClasses}>
                                            <Button icon={<FontAwesomeIcon icon={faFileImport} />} onClick={() => classImportRef.current?.click()} />
                                        </Tooltip>
                                        <Tooltip title={t.exportClasses}>
                                            <Button icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportClasses} />
                                        </Tooltip>
                                    </Space.Compact>
                                </Flex>
                                <input type="file" ref={classImportRef} onChange={handleImportClasses} style={{ display: 'none' }} accept=".txt" />
                                <div className="class-list-container">
                                    <List
                                        size="small"
                                        dataSource={Object.entries(classMap)}
                                        renderItem={([idx, { label, color }]) => {
                                            const index = parseInt(idx);
                                            return (
                                                <List.Item>
                                                    <div className="class-management-item">
                                                        <input type="color" value={color} className="color-picker-input" onChange={e => handleUpdateClass(index, 'color', e.target.value)} />
                                                        <Input value={label} onChange={e => handleUpdateClass(index, 'label', e.target.value)} placeholder={t.className} />
                                                        <Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteClass(index)} danger /></Tooltip>
                                                    </div>
                                                </List.Item>
                                            );
                                        }}
                                    />
                                </div>
                                <Button onClick={handleAddClass} icon={<FontAwesomeIcon icon={faPlus} />} block style={{ marginTop: 16 }}>{t.addClass}</Button>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.settings}><FontAwesomeIcon icon={faCogs} /></Tooltip>} key="3">
                            <div className="tab-pane-content">
                                <Title level={5}>{t.settings}</Title>
                                <Form layout="vertical">
                                    <Form.Item label={t.apiMode}>
                                        <Radio.Group onChange={e => setApiMode(e.target.value)} value={apiMode}>
                                            <Radio.Button value="auto">{t.apiModeAuto}</Radio.Button>
                                            <Radio.Button value="manual">{t.apiModeManual}</Radio.Button>
                                        </Radio.Group>
                                    </Form.Item>
                                    {apiMode === 'manual' && (
                                        <Form.Item label={t.manualApiEndpoint}>
                                            <Radio.Group onChange={e => setManualApiEndpoint(e.target.value)} value={manualApiEndpoint}>
                                                <Space direction="vertical">
                                                    <Radio value="new">{t.apiForNew}</Radio>
                                                    <Radio value="incremental">{t.apiForIncremental}</Radio>
                                                </Space>
                                            </Radio.Group>
                                        </Form.Item>
                                    )}
                                </Form>
                            </div>
                        </TabPane>
                    </Tabs>
                </Sider>
                <div className="resizer-horizontal" onMouseDown={() => setIsResizingLeftSider(true)} />
                <Layout className="file-operate-main-content-wrapper">
                    <Content className="file-operate-canvas-content">
                        <div className={`file-operate-canvas-wrapper ${isColoringMode ? 'coloring-mode' : ''}`}>
                            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />
                        </div>
                    </Content>
                    {!isInspectorVisible && (
                        <Tooltip title={t.showPanel}>
                            <Button
                                className="show-inspector-handle"
                                type="primary"
                                icon={<FontAwesomeIcon icon={faChevronLeft} />}
                                onClick={() => setIsInspectorVisible(true)}
                            />
                        </Tooltip>
                    )}
                </Layout>
                <div className="resizer-horizontal" onMouseDown={() => setIsResizingInspector(true)} style={{ display: isInspectorVisible ? 'flex' : 'none' }} />
                    
                <Sider width={isInspectorVisible ? inspectorWidth : 0} className="file-operate-inspector-sider" theme="light" collapsible collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
                    {isInspectorVisible && (
                        <Card
                            title={<Space><FontAwesomeIcon icon={faList} />{t.dataExplorer}</Space>}
                            extra={<Tooltip title={t.hidePanel}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(false)} /></Tooltip>}
                            style={{ height: '100%', display: 'flex', flexDirection: 'column', border: 'none', borderRadius: 0 }}
                            headStyle={{ borderBottom: '1px solid var(--border-color-light)', padding: '0 16px', flexShrink: 0 }}
                            bodyStyle={{ flexGrow: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}
                        >
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Title level={5} style={{ marginBottom: 8 }}>YOLO Data</Title>
                                <textarea
                                    value={currentYoloContent ? addRectNameToYoloContent(currentYoloContent) : ""}
                                    className="yolo-content-textarea"
                                    readOnly
                                    style={{ flex: 1 }}
                                />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                <Title level={5} style={{ marginBottom: 8 }}>JSON Data</Title>
                                <textarea
                                    value={currentJsonContent || "{}"}
                                    className="yolo-content-textarea"
                                    readOnly
                                    style={{ flex: 1 }}
                                />
                            </div>
                        </Card>
                    )}
                </Sider>
            </Layout>
        </Layout>
    );
};

export default FileOperate;