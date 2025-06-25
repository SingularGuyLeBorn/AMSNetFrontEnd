// START OF FILE src/pages/FileOperate/index.tsx
import React, { useState, useRef, useEffect, ChangeEvent, MouseEvent, useCallback, useMemo } from 'react';
import {
    Layout,
    Tabs,
    Button,
    Space,
    Typography,
    Select,
    Form,
    Input,
    Tooltip,
    message,
    List,
    Radio,
    Divider,
    Flex,
    Modal,
    Collapse,
    Descriptions,
    InputNumber,
} from 'antd';
import { useModel } from "@umijs/max";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faUpload, faSave, faUndo, faRedo, faTrash,
    faArrowLeft, faArrowRight, faPaintBrush, faPlus,
    faPen, faList, faMinusCircle, faMousePointer,
    faChevronLeft, faChevronRight, faRobot, faCogs, faTags, faFileImport, faFileExport, faDatabase
} from "@fortawesome/free-solid-svg-icons";
import { jsonNameColorMap, translations, ClassInfo, Operation } from './constants';
import './index.css';


const { Option } = Select;
const { Title, Text } = Typography;
const { Sider, Content, Header } = Layout;
const { TabPane } = Tabs;
const { Panel } = Collapse;

type ActiveTool = 'draw' | 'stain' | 'delete' | 'select';
type Point = { x: number; y: number };
type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';

type DraggingState = {
    type: 'move' | 'resize';
    boxName: string; 
    handle?: ResizeHandle;
    startMousePos: Point;
    // For 'move': initial relative coordinates
    startYoloData?: { relX: number; relY: number; }; 
    // For 'resize': initial absolute pixel dimensions and relative YOLO data
    startAbsBox?: { x: number; y: number; w: number; h: number; };
    startFullYoloLine?: string;
} | null;


interface JsonData {
    local: {
        buildingBlocks: { [key: string]: string[] };
        constants: { [key: string]: string[] };
    };
    global: { [key: string]: any };
}

const RESIZE_HANDLE_SIZE = 8;

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
    const [activeTool, setActiveTool] = useState<ActiveTool>('draw');
    const [redrawTrigger, setRedrawTrigger] = useState(0);
    const [inspectorWidth, setInspectorWidth] = useState<number>(350);
    const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
    const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
    const [isAiAnnotating, setIsAiAnnotating] = useState(false);
    const [apiMode, setApiMode] = useState<'auto' | 'manual'>('auto');
    const [manualApiEndpoint, setManualApiEndpoint] = useState<'new' | 'incremental'>('new');
    const classImportRef = useRef<HTMLInputElement>(null);
    const folderUploadRef = useRef<HTMLInputElement>(null);
    const saveOnUnmountRef = useRef<() => void>();

    const [draggingState, setDraggingState] = useState<DraggingState>(null);
    const [selectedBoxName, setSelectedBoxName] = useState<string | null>(null);
    const [isCurrentlyEditingId, setIsCurrentlyEditingId] = useState<string | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null);

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

    const getResizeHandles = (box: {x: number, y: number, width: number, height: number}): {[key in ResizeHandle]: {x: number, y: number, size: number}} => {
        const s = RESIZE_HANDLE_SIZE; const { x, y, width, height } = box;
        return { topLeft: { x: x - s/2, y: y - s/2, size: s }, top: { x: x + width/2 - s/2, y: y - s/2, size: s }, topRight: { x: x + width - s/2, y: y - s/2, size: s }, left: { x: x - s/2, y: y + height/2 - s/2, size: s }, right: { x: x + width - s/2, y: y + height/2 - s/2, size: s }, bottomLeft: { x: x - s/2, y: y + height - s/2, size: s }, bottom: { x: x + width/2 - s/2, y: y + height - s/2, size: s }, bottomRight:{ x: x + width - s/2, y: y + height - s/2, size: s }, };
      };
    
    const getCursorForHandle = (handle: ResizeHandle | null): string => {
        if (!handle) return 'default';
        if (handle === 'topLeft' || handle === 'bottomRight') return 'resize-nwse';
        if (handle === 'topRight' || handle === 'bottomLeft') return 'resize-nesw';
        if (handle === 'top' || handle === 'bottom') return 'resize-ns';
        if (handle === 'left' || handle === 'right') return 'resize-ew';
        return 'default';
    }

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;

        if (currentPng) {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width; canvas.height = img.height;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);

                const yoloLines = currentYoloContent?.split('\n').filter(Boolean) || [];
                const yoloDataForStain: { name: string, data: number[] }[] = [];

                yoloLines.forEach(line => {
                    const parts = line.split(' ');
                    if (parts.length < 6) return;
                    const name = parts[0];
                    const numericParts = parts.slice(1).map(parseFloat);
                    if (numericParts.some(isNaN)) return;

                    yoloDataForStain.push({ name, data: numericParts });

                    const [classIndex, relX, relY, relW, relH] = numericParts;
                    const absW = relW * canvas.width;
                    const absH = relH * canvas.height;
                    const absLeft = (relX - relW / 2) * canvas.width;
                    const absTop = (relY - relH / 2) * canvas.height;
                    
                    const isSelected = selectedBoxName === name;
                    const color = classMap[classIndex]?.color || '#808080';
                    ctx.beginPath();
                    ctx.strokeStyle = isSelected ? '#0958d9' : color;
                    ctx.lineWidth = isSelected ? 3 : 2;
                    ctx.rect(absLeft, absTop, absW, absH);
                    ctx.stroke();

                    if (isSelected) {
                        const handles = getResizeHandles({x: absLeft, y: absTop, width: absW, height: absH});
                        ctx.fillStyle = '#0958d9';
                        Object.values(handles).forEach(handle => ctx.fillRect(handle.x, handle.y, handle.size, handle.size));
                    }
                });

                const parsedJson = parseJsonContent(currentJsonContent);
                if (!parsedJson.local) return;

                Object.values(parsedJson.local).forEach(nameMap => {
                    if (nameMap && typeof nameMap === 'object') {
                        Object.entries(nameMap).forEach(([name, boxNamesArray]) => {
                            const color = jsonNameColorMap[name]; if (!color || !Array.isArray(boxNamesArray)) return;
                            boxNamesArray.forEach(boxName => {
                                const yoloEntry = yoloDataForStain.find(y => y.name === boxName);
                                if (!yoloEntry) return;

                                const [, relX, relY, relW, relH] = yoloEntry.data;
                                const absW = relW * canvas.width; const absH = relH * canvas.height;
                                const absX = (relX * canvas.width) - absW / 2; const absY = (relY * canvas.height) - absH / 2;
                                ctx.fillStyle = color; ctx.globalAlpha = 0.35;
                                ctx.fillRect(absX, absY, absW, absH); ctx.globalAlpha = 1.0;
                            });
                        });
                    }
                });
            };
            img.src = URL.createObjectURL(currentPng);
            return () => URL.revokeObjectURL(img.src);
        } else {
            const parent = canvas.parentElement;
            if (!parent) return;
            const { offsetWidth, offsetHeight } = parent;
            canvas.width = offsetWidth > 0 ? offsetWidth : 800;
            canvas.height = offsetHeight > 0 ? offsetHeight : 600;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#F0F5FF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0D1A2E"; ctx.textAlign = "center";
            ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
        }
    }, [currentPng, currentYoloContent, currentJsonContent, classMap, parseJsonContent, t.noImages, selectedBoxName]);

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
    }, [pngList, currentYoloContent, currentJsonContent, setYoloList, setJsonList]);

    useEffect(() => { saveOnUnmountRef.current = () => saveCurrentFileState(currentIndex); });
    useEffect(() => { return () => { if (saveOnUnmountRef.current) { saveOnUnmountRef.current(); } }; }, []);

    useEffect(() => {
        if (pngList.length > 0 && currentIndex < pngList.length) {
            setCurrentPng(pngList[currentIndex]);
        } else {
            setCurrentPng(null); setCurrentYoloContent(null); setCurrentJsonContent(null); return;
        }

        const readFileContent = async (fileList: File[], index: number, setter: (content: string | null) => void) => {
            const baseName = getFileNameWithoutExtension(pngList[index].name);
            const targetFile = fileList.find(f => getFileNameWithoutExtension(f.name) === baseName);
            if (targetFile) {
                try {
                    const text = await targetFile.text(); setter(text);
                } catch (e) { console.error("Error reading file:", e); setter(null); }
            } else { setter(null); }
        };

        readFileContent(yoloList, currentIndex, (content) => setCurrentYoloContent(content ? content.split('\n').filter(line => line.trim() !== '').join('\n') : ''));
        readFileContent(jsonList, currentIndex, (content) => setCurrentJsonContent(stringifyJsonContent(parseJsonContent(content))));
    }, [currentIndex, pngList, yoloList, jsonList, parseJsonContent, stringifyJsonContent]);

    useEffect(() => { if (currentPng) { setRedrawTrigger(prev => prev + 1); } }, [currentPng]);
    useEffect(() => { redrawCanvas(); }, [redrawTrigger, redrawCanvas]);
    useEffect(() => { const handleResize = () => setRedrawTrigger(p => p + 1); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => { const handleMouseMove = (e: globalThis.MouseEvent) => { if (!isResizingInspector) return; const newWidth = window.innerWidth - e.clientX; if (newWidth > 200 && newWidth < 800) setInspectorWidth(newWidth); }; const handleMouseUp = () => setIsResizingInspector(false); if (isResizingInspector) { document.body.style.userSelect = 'none'; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); } return () => { document.body.style.userSelect = ''; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }; }, [isResizingInspector]);
    
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
        setCurrentIndex(0); setOperationHistory({}); setRedoHistory({});
        if (folderUploadRef.current) folderUploadRef.current.value = "";
    };

    const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;

        const yoloLines = currentYoloContent.split('\n').filter(Boolean);

        if (activeTool === 'stain') {
            if (!selectedJsonName || !selectedJsonType) return;
            for (const line of yoloLines) {
                const parts = line.split(' ');
                if (parts.length < 6) continue;
                const boxName = parts[0];
                const [, relX, relY, relW, relH] = parts.slice(1).map(parseFloat);
                if (isNaN(relX) || isNaN(relY) || isNaN(relW) || isNaN(relH)) continue;
                const boxX = (relX - relW / 2) * canvas.width; const boxY = (relY - relH / 2) * canvas.height;
                const boxW = relW * canvas.width; const boxH = relH * canvas.height;
                if (mouseX >= boxX && mouseX <= boxX + boxW && mouseY >= boxY && mouseY <= boxY + boxH) {
                    const previousJson = currentJsonContent;
                    const newJson = stringifyJsonContent((() => {
                        const jsonObj = parseJsonContent(currentJsonContent);
                        const targetDict = jsonObj.local[selectedJsonType!];
                        if (!targetDict[selectedJsonName]) targetDict[selectedJsonName] = [];
                        if (!targetDict[selectedJsonName].includes(boxName)) {
                            targetDict[selectedJsonName].push(boxName);
                        } else {
                            targetDict[selectedJsonName] = targetDict[selectedJsonName].filter(bn => bn !== boxName);
                        }
                        return jsonObj;
                    })());
                    setCurrentJsonContent(newJson);
                    const newOp: Operation = { type: 'stain', boxName, jsonType: selectedJsonType, jsonName: selectedJsonName, previousJsonContent: previousJson };
                    setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] }));
                    setRedoHistory(prev => ({ ...prev, [currentIndex]: [] }));
                    setRedrawTrigger(p => p + 1);
                    break;
                }
            }
        } else if (activeTool === 'delete') {
            let deletedSomething = false;
            let lineToDelete: string | null = null;
            let lineIndexToDelete: number = -1;

            for (let i = yoloLines.length - 1; i >= 0; i--) {
                const line = yoloLines[i];
                const parts = line.split(' ');
                if (parts.length < 6) continue;
                const [, relX, relY, relW, relH] = parts.slice(1).map(parseFloat);
                const absLeft = (relX - relW / 2) * canvas.width; const absTop = (relY - relH / 2) * canvas.height;
                const absW = relW * canvas.width; const absH = relH * canvas.height;

                if (mouseX >= absLeft && mouseX <= absLeft + absW && mouseY >= absTop && mouseY <= absTop + absH) {
                    lineToDelete = line;
                    lineIndexToDelete = i;
                    deletedSomething = true;
                    break; // Delete only the top-most box
                }
            }

            if (deletedSomething && lineToDelete) {
                const previousYoloContentForUndo = currentYoloContent;
                const previousJsonContentForUndo = currentJsonContent;
                const deletedBoxName = lineToDelete.split(' ')[0];
                const newYoloLines = yoloLines.filter((_, index) => index !== lineIndexToDelete);
                const newYoloContent = newYoloLines.join('\n');
                setCurrentYoloContent(newYoloContent);

                let newJsonContent = currentJsonContent;
                if (deletedBoxName && currentJsonContent) {
                    const parsedJson = parseJsonContent(currentJsonContent);
                    Object.keys(parsedJson.local).forEach(typeKey => {
                        const type = typeKey as keyof typeof parsedJson.local;
                        Object.keys(parsedJson.local[type]).forEach(nameKey => {
                            parsedJson.local[type][nameKey] = parsedJson.local[type][nameKey].filter(
                                (bName: string) => bName !== deletedBoxName
                            );
                        });
                    });
                    newJsonContent = stringifyJsonContent(parsedJson);
                    setCurrentJsonContent(newJsonContent);
                }

                const newOp: Operation = { type: 'delete', deletedLines: [{ index: lineIndexToDelete, content: lineToDelete }], previousYoloContent: previousYoloContentForUndo, previousJsonContent: previousJsonContentForUndo, };
                setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] }));
                setRedoHistory(prev => ({ ...prev, [currentIndex]: [] }));
                message.success('成功删除标注框及其关联');
                setRedrawTrigger(p => p + 1);
            }
        }
    };

    const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
        if (activeTool === 'stain' || activeTool === 'delete') {
            handleCanvasClick(e);
            return;
        }

        const canvas = canvasRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;

        if (activeTool === 'draw') {
            setMouseDownCoords({ x, y });
            setIsDrawing(true);
            const ctx = canvas.getContext('2d');
            if (ctx) setCanvasImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        } else if (activeTool === 'select') {
            const yoloLines = currentYoloContent?.split('\n').filter(Boolean) || [];

            // 检查是否点击了缩放手柄
            const selectedBoxLine = yoloLines.find(line => line.startsWith(selectedBoxName + ' '));
            if (selectedBoxName && selectedBoxLine) {
                const parts = selectedBoxLine.split(' ').slice(1).map(parseFloat);
                const [, relX, relY, relW, relH] = parts;
                const absW = relW * canvas.width, absH = relH * canvas.height;
                const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
                const handles = getResizeHandles({x: absLeft, y: absTop, width: absW, height: absH});
                
                for(const handleKey of Object.keys(handles) as ResizeHandle[]) {
                    const handle = handles[handleKey];
                    if (x >= handle.x && x <= handle.x + handle.size && y >= handle.y && y <= handle.y + handle.size) {
                        setDraggingState({
                            type: 'resize',
                            boxName: selectedBoxName,
                            handle: handleKey,
                            startMousePos: { x, y },
                            startAbsBox: { x: absLeft, y: absTop, w: absW, h: absH },
                            startFullYoloLine: selectedBoxLine
                        });
                        const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent }; // Use 'move' for simplicity or create a 'resize' op
                        setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] }));
                        setRedoHistory(prev => ({ ...prev, [currentIndex]: [] }));
                        return;
                    }
                }
            }

            // 检查是否点击了框体内部（用于移动）
            let clickedBox: string | null = null;
            let clickedYoloData: { relX: number; relY: number } | null = null;
            
            for (let i = yoloLines.length - 1; i >= 0; i--) {
                const line = yoloLines[i];
                const parts = line.split(' ');
                if (parts.length < 6) continue;
                const name = parts[0];
                const [, relX, relY, relW, relH] = parts.slice(1).map(parseFloat);
                const absLeft = (relX - relW / 2) * canvas.width;
                const absTop = (relY - relH / 2) * canvas.height;
                const absW = relW * canvas.width;
                const absH = relH * canvas.height;

                if (x >= absLeft && x <= absLeft + absW && y >= absTop && y <= absTop + absH) {
                    clickedBox = name;
                    clickedYoloData = { relX, relY };
                    break;
                }
            }

            setSelectedBoxName(clickedBox);
            if (clickedBox && clickedYoloData) {
                // 开始移动
                setDraggingState({
                    type: 'move',
                    boxName: clickedBox,
                    startMousePos: { x, y },
                    startYoloData: clickedYoloData,
                });
                const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent };
                setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] }));
                setRedoHistory(prev => ({ ...prev, [currentIndex]: [] }));
            } else {
                setDraggingState(null);
            }
        }
    };

    const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left; const currentY = e.clientY - rect.top;

        if (isDrawing && activeTool === 'draw') {
            const ctx = canvas.getContext('2d');
            if (ctx && canvasImageData) {
                ctx.putImageData(canvasImageData, 0, 0); ctx.beginPath();
                ctx.strokeStyle = classMap[currentClassIndex]?.color || '#262626';
                ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
                ctx.rect(mouseDownCoords.x, mouseDownCoords.y, currentX - mouseDownCoords.x, currentY - mouseDownCoords.y);
                ctx.stroke(); ctx.setLineDash([]);
            }
        } else if (draggingState && activeTool === 'select') {
            if (draggingState.type === 'move' && draggingState.startYoloData) {
                const dx = (currentX - draggingState.startMousePos.x) / canvas.width;
                const dy = (currentY - draggingState.startMousePos.y) / canvas.height;
                const newRelX = draggingState.startYoloData.relX + dx;
                const newRelY = draggingState.startYoloData.relY + dy;
    
                const newYoloContent = (currentYoloContent || '').split('\n').map(line => {
                    const parts = line.split(' ');
                    if (parts[0] === draggingState.boxName) {
                        return `${parts[0]} ${parts[1]} ${newRelX.toFixed(6)} ${newRelY.toFixed(6)} ${parts[4]} ${parts[5]}`;
                    }
                    return line;
                }).join('\n');
                setCurrentYoloContent(newYoloContent);
                setRedrawTrigger(p => p + 1);
            } else if (draggingState.type === 'resize' && draggingState.startAbsBox && draggingState.handle && draggingState.startFullYoloLine) {
                const dx = currentX - draggingState.startMousePos.x;
                const dy = currentY - draggingState.startMousePos.y;
                let { x: newX, y: newY, w: newW, h: newH } = draggingState.startAbsBox;
                
                if (draggingState.handle.includes('right')) newW = Math.max(1, draggingState.startAbsBox.w + dx);
                if (draggingState.handle.includes('left')) { newX = draggingState.startAbsBox.x + dx; newW = Math.max(1, draggingState.startAbsBox.w - dx); }
                if (draggingState.handle.includes('bottom')) newH = Math.max(1, draggingState.startAbsBox.h + dy);
                if (draggingState.handle.includes('top')) { newY = draggingState.startAbsBox.y + dy; newH = Math.max(1, draggingState.startAbsBox.h - dy); }

                const newRelW = newW / canvas.width; const newRelH = newH / canvas.height;
                const newRelX = (newX + newW / 2) / canvas.width; const newRelY = (newY + newH / 2) / canvas.height;

                const lineParts = draggingState.startFullYoloLine.split(' ');
                const newLine = `${lineParts[0]} ${lineParts[1]} ${newRelX.toFixed(6)} ${newRelY.toFixed(6)} ${newRelW.toFixed(6)} ${newRelH.toFixed(6)}`;
                
                const newYoloContent = (currentYoloContent || '').split('\n').map(line => 
                    line.startsWith(draggingState.boxName + ' ') ? newLine : line
                ).join('\n');
                setCurrentYoloContent(newYoloContent);
            }
        } else if (activeTool === 'select' && selectedBoxName) {
            // 更新光标样式
            let newHoveredHandle: ResizeHandle | null = null;
            const yoloLines = (currentYoloContent || '').split('\n');
            const selectedLine = yoloLines.find(line => line.startsWith(selectedBoxName + ' '));
            if (selectedLine) {
                const [, relX, relY, relW, relH] = selectedLine.split(' ').slice(1).map(parseFloat);
                const absW = relW * canvas.width, absH = relH * canvas.height;
                const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
                const handles = getResizeHandles({x: absLeft, y: absTop, width: absW, height: absH});
                for(const handleKey of Object.keys(handles) as ResizeHandle[]) {
                    const handle = handles[handleKey];
                    if (currentX >= handle.x && currentX <= handle.x + handle.size && currentY >= handle.y && currentY <= handle.y + handle.size) {
                        newHoveredHandle = handleKey;
                        break;
                    }
                }
            }
            setHoveredHandle(newHoveredHandle);
        } else {
            if (hoveredHandle !== null) setHoveredHandle(null);
        }
    };
    
    const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
        if (isDrawing && activeTool === 'draw') {
            setIsDrawing(false);
            const canvas = canvasRef.current; if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const upX = e.clientX - rect.left; const upY = e.clientY - rect.top;
            const x1 = Math.min(mouseDownCoords.x, upX); const y1 = Math.min(mouseDownCoords.y, upY);
            const width = Math.abs(upX - mouseDownCoords.x); const height = Math.abs(upY - mouseDownCoords.y);

            if (width > 2 && height > 2) {
                const classLabel = classMap[currentClassIndex]?.label || `class_${currentClassIndex}`;
                const yoloLines = currentYoloContent?.split('\n') || [];

                const existingCounters = yoloLines
                    .map(line => line.split(' ')[0])
                    .filter(name => name.startsWith(`${classLabel}_`))
                    .map(name => parseInt(name.substring(classLabel.length + 1), 10))
                    .filter(num => !isNaN(num));

                const newCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 0;
                const uniqueName = `${classLabel}_${newCounter}`;

                const x_center = (x1 + width / 2) / canvas.width; const y_center = (y1 + height / 2) / canvas.height;
                const yoloWidth = width / canvas.width; const yoloHeight = height / canvas.height;
                const yoloFormatData = `${uniqueName} ${currentClassIndex} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${yoloWidth.toFixed(6)} ${yoloHeight.toFixed(6)}`;

                const previousYolo = currentYoloContent;
                setCurrentYoloContent(prev => (prev ? `${prev}\n${yoloFormatData}` : yoloFormatData));

                const newOp: Operation = { type: 'draw', yoloData: [yoloFormatData], previousYoloContent: previousYolo };
                setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] }));
                setRedoHistory(prev => ({ ...prev, [currentIndex]: [] }));
            }
            setCanvasImageData(null); setRedrawTrigger(prev => prev + 1);
        } else if (draggingState) {
            setDraggingState(null);
        }
    };

    const addUndoRecord = useCallback(() => {
        const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent };
        setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] }));
        setRedoHistory(prev => ({ ...prev, [currentIndex]: [] }));
      }, [currentYoloContent, currentIndex, setOperationHistory, setRedoHistory]);
    
      const handleEditFocus = useCallback((boxName: string) => {
        if (isCurrentlyEditingId !== boxName) {
          addUndoRecord();
          setIsCurrentlyEditingId(boxName);
        }
      }, [isCurrentlyEditingId, addUndoRecord]);
    
      const handleAnnotationPropertyUpdate = useCallback((boxName: string, propIndex: number, value: number | null) => {
        if (value === null) return;
        const newYoloContent = (currentYoloContent || '').split('\n').map(line => {
          const parts = line.split(' ');
          if (parts[0] === boxName) {
            parts[propIndex + 1] = (value as number).toFixed(6); // +1 to account for name at index 0
            return parts.join(' ');
          }
          return line;
        }).join('\n');
        setCurrentYoloContent(newYoloContent);
      }, [currentYoloContent, setCurrentYoloContent]);

    const handleUndo = () => {
        const currentImageHistory = operationHistory[currentIndex] || [];
        if (currentImageHistory.length === 0) { message.info(t.noUndoOperations); return; }
        const lastOperation = currentImageHistory[currentImageHistory.length - 1];
        let redoOp: Operation;
        switch (lastOperation.type) { case 'draw': case 'ai_annotate': case 'move': redoOp = { ...lastOperation, previousYoloContent: currentYoloContent }; break; case 'stain': case 'json_change': redoOp = { ...lastOperation, previousJsonContent: currentJsonContent }; break; case 'delete': redoOp = { ...lastOperation, previousYoloContent: currentYoloContent, previousJsonContent: currentJsonContent }; break; default: return; }
        setRedoHistory(prev => ({ ...prev, [currentIndex]: [redoOp, ...(prev[currentIndex] || [])] }));
        setOperationHistory(prev => ({ ...prev, [currentIndex]: currentImageHistory.slice(0, -1) }));
        if ('previousYoloContent' in lastOperation) { setCurrentYoloContent(lastOperation.previousYoloContent); }
        if ('previousJsonContent' in lastOperation) { setCurrentJsonContent(lastOperation.previousJsonContent); }
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful);
    };
    const handleRedo = () => {
        const currentImageRedoHistory = redoHistory[currentIndex] || [];
        if (currentImageRedoHistory.length === 0) { message.info(t.noRedoOperations); return; }
        const operationToRedo = currentImageRedoHistory[0];
        let undoOp: Operation;
        switch (operationToRedo.type) { case 'draw': case 'ai_annotate': case 'move': undoOp = { ...operationToRedo, previousYoloContent: currentYoloContent }; break; case 'stain': case 'json_change': undoOp = { ...operationToRedo, previousJsonContent: currentJsonContent }; break; case 'delete': undoOp = { ...operationToRedo, previousYoloContent: currentYoloContent, previousJsonContent: currentJsonContent }; break; default: return; }
        setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), undoOp] }));
        setRedoHistory(prev => ({ ...prev, [currentIndex]: currentImageRedoHistory.slice(1) }));
        if ('previousYoloContent' in operationToRedo) { setCurrentYoloContent(operationToRedo.previousYoloContent); }
        if ('previousJsonContent' in operationToRedo) { setCurrentJsonContent(operationToRedo.previousJsonContent); }
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful);
    };

    const handleNextIndex = useCallback(() => { if (currentIndex < pngList.length - 1) { saveCurrentFileState(currentIndex); setCurrentIndex(p => p + 1); } }, [currentIndex, pngList.length, saveCurrentFileState, setCurrentIndex]);
    const handlePrevIndex = useCallback(() => { if (currentIndex > 0) { saveCurrentFileState(currentIndex); setCurrentIndex(p => p - 1); } }, [currentIndex, saveCurrentFileState, setCurrentIndex]);

    const handleSaveAllToZip = async () => { if (pngList.length === 0) { message.warning(t.noFile); return; } await saveCurrentFileState(currentIndex); message.loading({ content: "正在准备数据并打包...", key: "exporting", duration: 0 }); const zip = new JSZip(); try { const upToDateYoloList = yoloList.map((file, i) => { if (i === currentIndex && currentYoloContent !== null) { return new File([currentYoloContent], file.name, { type: 'text/plain' }); } return file; }); const upToDateJsonList = jsonList.map((file, i) => { if (i === currentIndex && currentJsonContent !== null) { return new File([currentJsonContent], file.name, { type: 'application/json' }); } return file; }); for (let i = 0; i < pngList.length; i++) { const pngFile = pngList[i]; const baseName = getFileNameWithoutExtension(pngFile.name); zip.file(`images/${pngFile.name}`, pngFile); const yoloFile = upToDateYoloList.find(f => getFileNameWithoutExtension(f.name) === baseName); const yoloContentForFile = yoloFile ? await yoloFile.text() : ""; const finalYoloContent = yoloContentForFile.split('\n').map(line => { if (!line.trim()) return ''; const parts = line.split(' '); return parts.length >= 2 ? parts.slice(1).join(' ') : ''; }).filter(Boolean).join('\n'); zip.file(`yolo/${baseName}.txt`, finalYoloContent); const jsonFile = upToDateJsonList.find(f => getFileNameWithoutExtension(f.name) === baseName); const rawJsonContent = jsonFile ? await jsonFile.text() : null; const jsonContentForFile = stringifyJsonContent(parseJsonContent(rawJsonContent)); zip.file(`json/${baseName}.json`, jsonContentForFile); } const content = await zip.generateAsync({ type: 'blob' }); saveAs(content, 'fileoperate_annotations.zip'); message.success({ content: "所有文件已打包下载", key: "exporting", duration: 2 }); } catch (err: any) { message.error({ content: `导出失败: ${err.message}`, key: "exporting", duration: 2 }); } };
    const mockAiApiCall = (apiType: 'new' | 'incremental'): Promise<string[]> => { return new Promise(resolve => { setTimeout(() => { const classIndices = Object.keys(classMap); if (classIndices.length === 0) { resolve([]); return; } let mockDataLines = []; const numBoxes = apiType === 'new' ? Math.floor(Math.random() * 5) + 3 : Math.floor(Math.random() * 2) + 1; for (let i = 0; i < numBoxes; i++) { const classIndex = parseInt(classIndices[Math.floor(Math.random() * classIndices.length)], 10); const w = Math.random() * 0.15 + 0.05; const h = Math.random() * 0.15 + 0.05; const x = Math.random() * (1 - w) + w / 2; const y = Math.random() * (1 - h) + h / 2; mockDataLines.push(`${classIndex} ${x.toFixed(6)} ${y.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`); } resolve(mockDataLines); }, 1500); }); };
    const handleAiAnnotation = async () => { if (!currentPng) { message.warning(t.noFile); return; } setIsAiAnnotating(true); const apiType = apiMode === 'auto' ? (!currentYoloContent || currentYoloContent.trim() === '' ? 'new' : 'incremental') : manualApiEndpoint; try { const aiResults = await mockAiApiCall(apiType); if (aiResults.length > 0) { const previousYolo = currentYoloContent; let newYoloContent = previousYolo || ''; const yoloLinesForNameGen = newYoloContent.split('\n'); const newLinesWithNames = aiResults.map(aiLine => { const parts = aiLine.split(' '); const classIndex = parseInt(parts[0], 10); const classLabel = classMap[classIndex]?.label || `class_${classIndex}`; const existingCounters = yoloLinesForNameGen.map(line => line.split(' ')[0]).filter(name => name.startsWith(`${classLabel}_`)).map(name => parseInt(name.substring(classLabel.length + 1), 10)).filter(num => !isNaN(num)); const newCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 0; const uniqueName = `${classLabel}_${newCounter}`; const newLine = `${uniqueName} ${aiLine}`; yoloLinesForNameGen.push(newLine); return newLine; }); newYoloContent = (newYoloContent ? `${newYoloContent}\n` : '') + newLinesWithNames.join('\n'); setCurrentYoloContent(newYoloContent); const newOp: Operation = { type: 'ai_annotate', yoloData: newLinesWithNames, previousYoloContent: previousYolo }; setOperationHistory(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), newOp] })); setRedoHistory(prev => ({ ...prev, [currentIndex]: [] })); setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful); } else { message.info("AI 未返回有效标注结果。"); } } catch (error) { message.error("AI 标注失败。"); } finally { setIsAiAnnotating(false); } };
    const handleAddClass = () => { const existingIndices = Object.keys(classMap).map(Number); const newIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0; setClassMap(prev => ({ ...prev, [newIndex]: { label: 'new_class', color: generateRandomColor() } })); };
    const handleUpdateClass = (index: number, field: 'label' | 'color', value: string) => { setClassMap(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } })); };
    const handleDeleteClass = (indexToDelete: number) => { const title = t.deleteClassConfirmTitle ? t.deleteClassConfirmTitle.replace('%s', `[${indexToDelete}] ${classMap[indexToDelete]?.label}`) : `确认删除类别 [${indexToDelete}] ${classMap[indexToDelete]?.label}?`; Modal.confirm({ title: title, content: t.deleteClassConfirmContent || "此操作不可恢复，且会影响所有使用该类别的标注数据。", okText: t.confirmDelete || "确认删除", cancelText: t.cancel || "取消", okType: 'danger', onOk: () => { const newClassMap = { ...classMap }; delete newClassMap[indexToDelete]; setClassMap(newClassMap); if (currentClassIndex === indexToDelete) { const firstKey = Object.keys(newClassMap)[0]; setCurrentClassIndex(firstKey ? parseInt(firstKey) : 0); } message.success("类别已删除"); } }); };
    const handleExportClasses = () => { const classText = Object.values(classMap).map(c => c.label).join('\n'); const blob = new Blob([classText], { type: 'text/plain;charset=utf-8' }); saveAs(blob, 'classes.txt'); };
    const handleImportClasses = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { const text = e.target?.result as string; const labels = text.split('\n').map(l => l.trim()).filter(Boolean); const newClassMap: { [key: number]: ClassInfo } = {}; labels.forEach((label, index) => { newClassMap[index] = { label, color: generateRandomColor() }; }); setClassMap(newClassMap); setCurrentClassIndex(0); message.success(`成功导入 ${labels.length} 个类别。`); }; reader.readAsText(file); if (event.target) event.target.value = ''; };
    const parsedYoloData = useMemo(() => {
        return (currentYoloContent || '').split('\n').filter(Boolean).map(line => {
            const parts = line.split(' ');
            if (parts.length < 6) return null;
            const [name, classIdx, x, y, w, h] = parts;
            return { name, classIdx: parseInt(classIdx), x: parseFloat(x), y: parseFloat(y), w: parseFloat(w), h: parseFloat(h) };
        }).filter((item): item is { name: string; classIdx: number; x: number; y: number; w: number; h: number; } => item !== null && !isNaN(item.classIdx));
    }, [currentYoloContent]);
    
    const isSelectedForEdit = (item: {name: string}) => activeTool === 'select' && item.name === selectedBoxName;

    return (
        <Layout className="unified-layout">
            <Header className="unified-top-header">
                <div className="header-left-controls">
                    <Button type="primary" onClick={() => folderUploadRef.current?.click()} icon={<FontAwesomeIcon icon={faUpload} />}>{t.uploadFolder}</Button>
                    <input ref={folderUploadRef} type="file" {...{ webkitdirectory: "true", directory: "true" } as any} multiple onChange={handleFolderUpload} style={{ display: 'none' }} />
                </div>
                <Space className="header-center-controls">
                    <Button onClick={handlePrevIndex} disabled={currentIndex === 0 || pngList.length === 0} icon={<FontAwesomeIcon icon={faArrowLeft} />} />
                    <Text className="current-file-text" title={currentPng?.name}>{currentPng ? `${t.currentFile}: ${currentPng.name} (${currentIndex + 1}/${pngList.length})` : t.noImages}</Text>
                    <Button onClick={handleNextIndex} disabled={currentIndex >= pngList.length - 1 || pngList.length === 0} icon={<FontAwesomeIcon icon={faArrowRight} />} />
                </Space>
                <div className="header-right-controls">
                    <Tooltip title={t.undo}><Button onClick={handleUndo} icon={<FontAwesomeIcon icon={faUndo} />} disabled={(operationHistory[currentIndex] || []).length === 0} /></Tooltip>
                    <Tooltip title={t.redo}><Button onClick={handleRedo} icon={<FontAwesomeIcon icon={faRedo} />} disabled={(redoHistory[currentIndex] || []).length === 0} /></Tooltip>
                    <Button onClick={handleSaveAllToZip} icon={<FontAwesomeIcon icon={faSave} />} type="primary" ghost disabled={pngList.length === 0}>{t.saveAll}</Button>
                </div>
            </Header>
            <Layout hasSider>
                <Sider width={60} className="unified-tool-sider" theme="light">
                    <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: '16px' }}>
                        <Tooltip title={t.selectTool} placement="right"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={pngList.length === 0} /></Tooltip>
                        <Tooltip title={t.drawingMode} placement="right"><Button onClick={() => setActiveTool('draw')} type={activeTool === 'draw' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faPen} />} disabled={pngList.length === 0} /></Tooltip>
                        <Tooltip title={t.coloringMode} placement="right"><Button onClick={() => setActiveTool('stain')} type={activeTool === 'stain' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={pngList.length === 0} /></Tooltip>
                        <Tooltip title={t.deleteBox} placement="right"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={pngList.length === 0} /></Tooltip>
                        <Divider style={{ margin: '8px 0' }} />
                        <Tooltip title={t.aiAnnotation} placement="right"><Button onClick={handleAiAnnotation} type="text" className="tool-button" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!currentPng || isAiAnnotating} /></Tooltip>
                    </Space>
                </Sider>
                <Layout className="main-content-wrapper">
                    <Content className="canvas-content">
                        <div className={`canvas-wrapper`}>
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                className={`${activeTool === 'delete' ? 'delete-cursor' : (activeTool === 'draw' ? 'draw-cursor' : getCursorForHandle(hoveredHandle))}`}
                            />
                        </div>
                    </Content>
                    {!isInspectorVisible && (
                        <Tooltip title={t.showPanel} placement="left">
                            <Button className="show-inspector-handle" type="primary" icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => setIsInspectorVisible(true)} />
                        </Tooltip>
                    )}
                </Layout>
                <div className="resizer-horizontal" onMouseDown={() => setIsResizingInspector(true)} style={{ display: isInspectorVisible ? 'flex' : 'none', cursor: 'ew-resize' }} />
                <Sider width={isInspectorVisible ? inspectorWidth : 0} className="unified-inspector-sider" theme="light" collapsible collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
                    <Tabs defaultActiveKey="1" className="inspector-tabs"
                        tabBarExtraContent={<Tooltip title={t.hidePanel}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(false)} /></Tooltip>}
                    >
                        <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="1">
                            <div className="tab-pane-content">
                                <Form layout="vertical">
                                    <Form.Item label={t.category} style={{ display: activeTool === 'draw' ? 'block' : 'none' }}>
                                        <Select value={currentClassIndex} onChange={setCurrentClassIndex} style={{ width: '100%' }}>{Object.entries(classMap).map(([idx, { color, label }]) => ( <Option key={idx} value={parseInt(idx)}> <Space><div style={{ width: '16px', height: '16px', backgroundColor: color, borderRadius: '3px', border: '1px solid #ccc' }} />{`[${idx}] ${label}`}</Space> </Option> ))}</Select>
                                    </Form.Item>
                                    <Form.Item label={t.chooseJsonName} style={{ display: activeTool === 'stain' ? 'block' : 'none' }}><Select placeholder={t.chooseJsonName} value={selectedJsonName} onChange={setSelectedJsonName} style={{ width: '100%' }}>{Object.keys(jsonNameColorMap).map(name => <Option key={name} value={name}>{name}</Option>)}</Select></Form.Item>
                                    <Form.Item label={t.chooseJsonType} style={{ display: activeTool === 'stain' ? 'block' : 'none' }}><Select placeholder={t.chooseJsonType} value={selectedJsonType} onChange={(v) => setSelectedJsonType(v as any)} style={{ width: '100%' }}><Option key="buildingBlocks" value="buildingBlocks">Building Blocks</Option><Option key="constants" value="constants">Constants</Option></Select></Form.Item>
                                </Form>
                                <Divider />
                                <Title level={5} style={{ marginBottom: 8 }}>{t.annotations}</Title>
                                {parsedYoloData.length > 0 ? (
                                    <Collapse accordion activeKey={selectedBoxName || undefined} onChange={(key) => { const newKey = Array.isArray(key) ? key[0] : (typeof key === 'string' ? key : null); setSelectedBoxName(newKey); setIsCurrentlyEditingId(null); }}>
                                        {parsedYoloData.map((item) => (
                                            <Panel key={item.name} header={<Flex justify="space-between" align="center" style={{ width: '100%' }}><Space><div className="color-indicator" style={{ backgroundColor: classMap[item.classIdx]?.color || '#808080' }} /><Text className="category-name-text" title={item.name} ellipsis>{item.name}</Text></Space></Flex>} className="annotation-panel-item">
                                                <Descriptions bordered size="small" column={1} className="annotation-details">
                                                    <Descriptions.Item label={t.category}>{classMap[item.classIdx]?.label || 'N/A'}</Descriptions.Item>
                                                    <Descriptions.Item label="Center X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.x} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 2, v)} /> : item.x.toFixed(4)}</Descriptions.Item>
                                                    <Descriptions.Item label="Center Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.y} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 3, v)} /> : item.y.toFixed(4)}</Descriptions.Item>
                                                    <Descriptions.Item label="Width">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.w} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 4, v)} /> : item.w.toFixed(4)}</Descriptions.Item>
                                                    <Descriptions.Item label="Height">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.h} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 5, v)} /> : item.h.toFixed(4)}</Descriptions.Item>
                                                </Descriptions>
                                            </Panel>
                                        ))}
                                    </Collapse>
                                ) : <Text type="secondary" style={{ textAlign: 'center', display: 'block' }}>{t.noAnnotations}</Text>}
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.rawData} placement="bottom"><FontAwesomeIcon icon={faDatabase} /></Tooltip>} key="4">
                             <div className="tab-pane-content">
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px', gap: '8px' }}>
                                    <Title level={5}>YOLO Data</Title>
                                    <textarea value={currentYoloContent || ""} className="data-content-textarea" readOnly />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px', gap: '8px', marginTop: '16px' }}>
                                    <Title level={5}>JSON Data</Title>
                                    <textarea value={currentJsonContent || "{}"} className="data-content-textarea" readOnly />
                                </div>
                             </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2">
                            <div className="tab-pane-content">
                                <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}><Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title><Space.Compact><Tooltip title={t.importClasses}><Button icon={<FontAwesomeIcon icon={faFileImport} />} onClick={() => classImportRef.current?.click()} /></Tooltip><Tooltip title={t.exportClasses}><Button icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportClasses} /></Tooltip></Space.Compact></Flex>
                                <input type="file" ref={classImportRef} onChange={handleImportClasses} style={{ display: 'none' }} accept=".txt" />
                                <div className="class-list-container">
                                    <List size="small" dataSource={Object.entries(classMap)} renderItem={([idx, { label, color }]) => { const index = parseInt(idx); return ( <List.Item><div className="class-management-item"><Input type="color" value={color} className="color-picker-input" onChange={e => handleUpdateClass(index, 'color', e.target.value)} /><Input value={label} onChange={e => handleUpdateClass(index, 'label', e.target.value)} placeholder={t.className} /><Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteClass(index)} danger /></Tooltip></div></List.Item> ); }} />
                                </div>
                                <Button onClick={handleAddClass} icon={<FontAwesomeIcon icon={faPlus} />} block style={{ marginTop: 16 }}>{t.addClass}</Button>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCogs} /></Tooltip>} key="3">
                            <div className="tab-pane-content">
                                <Title level={5}>{t.settings}</Title>
                                <Form layout="vertical">
                                    <Form.Item label={t.apiMode}><Radio.Group onChange={e => setApiMode(e.target.value)} value={apiMode} optionType="button" buttonStyle="solid"><Radio.Button value="auto">{t.apiModeAuto}</Radio.Button><Radio.Button value="manual">{t.apiModeManual}</Radio.Button></Radio.Group></Form.Item>
                                    {apiMode === 'manual' && ( <Form.Item label={t.manualApiEndpoint}><Radio.Group onChange={e => setManualApiEndpoint(e.target.value)} value={manualApiEndpoint}><Space direction="vertical"><Radio value="new">{t.apiForNew}</Radio><Radio value="incremental">{t.apiForIncremental}</Radio></Space></Radio.Group></Form.Item> )}
                                </Form>
                            </div>

                        </TabPane>
                    </Tabs>
                </Sider>
            </Layout>
        </Layout>
    );
};

export default FileOperate;