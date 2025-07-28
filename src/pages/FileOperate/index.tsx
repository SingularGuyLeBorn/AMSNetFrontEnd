// FILE: src / pages / FileOperate / index.tsx
import { workspaceService } from "@/models/workspaceService";
import {
    createNode,
    deleteNode,
    findNode,
    updateNode,
    createRelationship,
    updateRelationship,
    deleteRelationship,
    findRelationship
} from "@/pages/GraphOperate/apiFunctions";
import {
    faArrowLeft, faArrowRight,
    faBook,
    faChevronLeft, faChevronRight,
    faCogs,
    faCubes,
    faDatabase, faEraser,
    faFileExport,
    faFileImport, faFolderTree, faHistory, faLink, faList, faMinusCircle, faMousePointer,
    faPaintBrush,
    faPen,
    faPlus,
    faProjectDiagram,
    faRedo,
    faRobot,
    faSearch,
    faSearchPlus,
    faTags,
    faTrash,
    faUndo,
    faEdit
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useModel } from "@umijs/max";
import {
    Button,
    Collapse,
    Descriptions,
    Divider,
    Flex,
    Form,
    Input,
    InputNumber,
    Layout,
    List,
    Modal,
    Radio,
    RadioChangeEvent,
    Select,
    Space,
    Spin,
    Tabs,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { saveAs } from 'file-saver';
import React, { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiComponent, ApiResponse, ClassInfo, Operation, translations } from './constants';
import './index.css';


const { Option } = Select;
const { Title, Text } = Typography;
const { Sider, Content, Header } = Layout;
const { TabPane } = Tabs;
const { Panel } = Collapse;

type ActiveTool = 'draw' | 'stain' | 'delete' | 'select' | 'region-delete';
type Point = { x: number; y: number };
type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';
type RegionSelectBox = { start: Point; end: Point; } | null;
type RegionDeleteMode = 'contain' | 'intersect';
type Property = { key: string; value: string };

type DraggingState = {
    type: 'move' | 'resize' | 'region-select' | 'magnifier-drag';
    boxName?: string;
    handle?: ResizeHandle;
    startMousePos: Point;
    startYoloData?: { relX: number; relY: number; };
    startAbsBox?: { x: number; y: number; w: number; h: number; };
    startFullYoloLine?: string;
    offset?: Point; // for magnifier drag
} | null;


interface JsonData {
    local: {
        [key: string]: { [key: string]: string[] }
    };
    global: { [key: string]: any };
}

type FullApiResponse = ApiResponse & {
    netlist_scs?: string;
    netlist_cdl?: string;
};

type ImageDetails = {
    name: string;
    element: HTMLImageElement;
    width: number;
    height: number;
    originalFile: File;
};


const RESIZE_HANDLE_SIZE = 8;
const MAGNIFIER_SIZE = 150;
const MAGNIFIER_ZOOM = 3;

const generateRandomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

const preloadImage = (file: File, signal?: AbortSignal): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        const cleanup = () => {
            URL.revokeObjectURL(url);
            if (signal) {
                signal.removeEventListener('abort', abortHandler);
            }
        };

        const abortHandler = () => {
            cleanup();
            reject(new DOMException('Aborted', 'AbortError'));
        };

        if (signal) {
            signal.addEventListener('abort', abortHandler);
        }

        img.onload = () => {
            cleanup();
            resolve(img);
        };
        img.onerror = (err) => {
            cleanup();
            reject(err);
        };
        img.src = url;
    });
};

export const parseJsonContent = (jsonContent: string | null): JsonData => {
    try {
        if (!jsonContent || jsonContent.trim() === "" || jsonContent.trim() === "{}") {
            return { local: {}, global: {} };
        }
        const parsed = JSON.parse(jsonContent);
        if (!parsed.local && !parsed.global && (parsed.cpnts || parsed.segments)) {
            return { local: {}, global: {} };
        }
        parsed.local = parsed.local || {};
        parsed.global = parsed.global || {};
        return parsed;
    } catch (e) {
        console.error("用于染色工具的JSON解析失败，返回默认对象。", e);
        return { local: {}, global: {} };
    }
};

export const stringifyJsonContent = (jsonObj: JsonData | null): string => {
    if (!jsonObj) return "{}";
    return JSON.stringify(jsonObj, null, 2);
};

const convertCpntsToYolo = (cpnts: ApiComponent[], imageWidth: number, imageHeight: number, file_classMap: { [key: number]: ClassInfo }): string => {
    if (!Array.isArray(cpnts) || imageWidth === 0 || imageHeight === 0) {
        return "";
    }
    const yoloLines: string[] = [];
    const existingNames: { [key: string]: number } = {};
    cpnts.forEach(cpnt => {
        if (typeof cpnt.t === 'undefined' || typeof cpnt.b === 'undefined' || typeof cpnt.l === 'undefined' || typeof cpnt.r === 'undefined' || typeof cpnt.type === 'undefined') {
            console.warn('跳过无效的cpnt对象:', cpnt);
            return;
        }
        const { t: top, b: bottom, l: left, r: right, type } = cpnt;
        let classIndex = -1;
        let classLabel = '';
        for (const [idx, info] of Object.entries(file_classMap)) {
            if (info.label === type) {
                classIndex = parseInt(idx, 10);
                classLabel = info.label;
                break;
            }
        }
        if (classIndex === -1) {
            console.warn(`在 file_classMap 中未找到类别 "${type}"`);
            return;
        }
        const absWidth = right - left;
        const absHeight = bottom - top;
        const absCenterX = left + absWidth / 2;
        const absCenterY = top + absHeight / 2;
        const relX = absCenterX / imageWidth;
        const relY = absCenterY / imageHeight;
        const relW = absWidth / imageWidth;
        const relH = absHeight / imageHeight;
        const baseName = classLabel;
        const counter = (existingNames[baseName] || 0) + 1;
        existingNames[baseName] = counter;
        const uniqueName = cpnt.name || `${baseName}_${counter - 1}`;
        yoloLines.push(`${uniqueName} ${classIndex} ${relX.toFixed(6)} ${relY.toFixed(6)} ${relW.toFixed(6)} ${relH.toFixed(6)}`);
    });
    return yoloLines.join('\n');
};


const FileOperate: React.FC = () => {
    const { initialState } = useModel('@@initialState');
    const {
        imageKeys,
        file_classMap, setFile_classMap,
        file_kgComponentMap, setFile_kgComponentMap,
        file_kgTypeMap, setFile_kgTypeMap,
        file_currentIndex, setFile_currentIndex,
        file_dirtyYolo, setFile_dirtyYolo,
        file_dirtyJson, setFile_dirtyJson,
        isAppBusy, setAppBusy,

        file_operationHistory, setFile_operationHistory,
        file_redoHistory, setFile_redoHistory,
    } = useModel('annotationStore');

    const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
    const t = translations[currentLang];

    const [currentImageDetails, setCurrentImageDetails] = useState<ImageDetails | null>(null);
    const [currentYoloContent, setCurrentYoloContent] = useState<string | null>(null);
    const [currentJsonContent, setCurrentJsonContent] = useState<string | null>(null);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [currentClassIndex, setCurrentClassIndex] = useState<number>(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [mouseDownCoords, setMouseDownCoords] = useState({ x: 0, y: 0 });
    const [canvasImageData, setCanvasImageData] = useState<ImageData | null>(null);
    const [selectedJsonName, setSelectedJsonName] = useState<string | null>(null);
    const [selectedJsonType, setSelectedJsonType] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ActiveTool>('select');
    const [redrawTrigger, setRedrawTrigger] = useState(0);
    const [inspectorWidth, setInspectorWidth] = useState<number>(350);
    const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
    const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
    const [explorerWidth, setExplorerWidth] = useState<number>(250);
    const [isResizingExplorer, setIsResizingExplorer] = useState<boolean>(false);
    const [isExplorerVisible, setIsExplorerVisible] = useState<boolean>(true);
    const [isAiAnnotating, setIsAiAnnotating] = useState(false);
    const classImportRef = useRef<HTMLInputElement>(null);

    const [draggingState, setDraggingState] = useState<DraggingState>(null);
    const [regionSelectBox, setRegionSelectBox] = useState<RegionSelectBox | null>(null);
    const [regionDeleteMode, setRegionDeleteMode] = useState<RegionDeleteMode>('contain');
    const [selectedBoxName, setSelectedBoxName] = useState<string | null>(null);
    const [isCurrentlyEditingId, setIsCurrentlyEditingId] = useState<string | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null);

    const [isMagnifierVisible, setIsMagnifierVisible] = useState(false);
    const [magnifierPos, setMagnifierPos] = useState<Point>({ x: 900, y: 200 });
    const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);
    const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });
    const [fileSearchTerm, setFileSearchTerm] = useState('');

    const [netlistScsContent, setNetlistScsContent] = useState<string | null>(null);
    const [netlistCdlContent, setNetlistCdlContent] = useState<string | null>(null);

    const [newComponentName, setNewComponentName] = useState('');
    const [newComponentType, setNewComponentType] = useState('');

    const [nodeForm] = Form.useForm();
    const [relationshipForm] = Form.useForm();


    const hasWorkspace = imageKeys.length > 0;
    const currentImageKey = hasWorkspace ? imageKeys[file_currentIndex] : null;
    const disabledUI = isAppBusy;

    useEffect(() => {
        setCurrentLang(initialState?.language || 'zh');
    }, [initialState?.language]);

    const parsedYoloData = useMemo(() => {
        return (currentYoloContent || '').split('\n').filter(Boolean).map(line => {
            const parts = line.split(' ');
            if (parts.length < 6) return null;
            const [name, classIdx, x, y, w, h] = parts;
            return { name, classIdx: parseInt(classIdx), x: parseFloat(x), y: parseFloat(y), w: parseFloat(w), h: parseFloat(h) };
        }).filter((item): item is { name: string; classIdx: number; x: number; y: number; w: number; h: number; } => item !== null && !isNaN(item.classIdx));
    }, [currentYoloContent]);

    const getResizeHandles = (box: { x: number, y: number, width: number, height: number }): { [key in ResizeHandle]: { x: number, y: number, size: number } } => {
        const s = RESIZE_HANDLE_SIZE; const { x, y, width, height } = box;
        return { topLeft: { x: x - s / 2, y: y - s / 2, size: s }, top: { x: x + width / 2 - s / 2, y: y - s / 2, size: s }, topRight: { x: x + width - s / 2, y: y - s / 2, size: s }, left: { x: x - s / 2, y: y + height / 2 - s / 2, size: s }, right: { x: x + width - s / 2, y: y + height / 2 - s / 2, size: s }, bottomLeft: { x: x - s / 2, y: y + height - s / 2, size: s }, bottom: { x: x + width / 2 - s / 2, y: y + height - s / 2, size: s }, bottomRight: { x: x + width - s / 2, y: y + height - s / 2, size: s }, };
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

        if (currentImageDetails && currentImageDetails.element) {
            const img = currentImageDetails.element;
            canvas.width = img.width; canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            const yoloDataForStain: { name: string, data: number[] }[] = [];
            parsedYoloData.forEach(item => {
                yoloDataForStain.push({ name: item.name, data: [item.classIdx, item.x, item.y, item.w, item.h] });
                const { name, classIdx, x: relX, y: relY, w: relW, h: relH } = item;
                const absW = relW * canvas.width;
                const absH = relH * canvas.height;
                const absLeft = (relX - relW / 2) * canvas.width;
                const absTop = (relY - relH / 2) * canvas.height;
                const isSelected = selectedBoxName === name;
                const color = file_classMap[classIdx]?.color || '#808080';
                ctx.beginPath();
                ctx.strokeStyle = isSelected ? '#0958d9' : color;
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.rect(absLeft, absTop, absW, absH);
                ctx.stroke();
                if (isSelected) {
                    const handles = getResizeHandles({ x: absLeft, y: absTop, width: absW, height: absH });
                    ctx.fillStyle = '#0958d9';
                    Object.values(handles).forEach(handle => ctx.fillRect(handle.x, handle.y, handle.size, handle.size));
                }
            });

            const parsedStainJson = parseJsonContent(currentJsonContent);
            if (parsedStainJson.local) {
                Object.values(parsedStainJson.local).forEach(typeDict => {
                    if (typeDict && typeof typeDict === 'object') {
                        Object.entries(typeDict).forEach(([name, boxNamesArray]) => {
                            const color = file_kgComponentMap[name]?.color; if (!color || !Array.isArray(boxNamesArray)) return;
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
            }

            if (regionSelectBox) {
                ctx.fillStyle = 'rgba(64, 150, 255, 0.3)';
                ctx.strokeStyle = 'rgba(64, 150, 255, 0.8)';
                ctx.lineWidth = 1;
                const x = Math.min(regionSelectBox.start.x, regionSelectBox.end.x);
                const y = Math.min(regionSelectBox.start.y, regionSelectBox.end.y);
                const w = Math.abs(regionSelectBox.start.x - regionSelectBox.end.x);
                const h = Math.abs(regionSelectBox.start.y - regionSelectBox.end.y);
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);
            }
        } else if (!isTransitioning) {
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
    }, [currentImageDetails, parsedYoloData, currentJsonContent, file_classMap, t.noImages, selectedBoxName, regionSelectBox, isTransitioning, file_kgComponentMap]);

    const getScaledCoords = useCallback((e: MouseEvent | { clientX: number, clientY: number }): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }, []);

    const drawMagnifier = useCallback(() => {
        if (!isMagnifierVisible || !isMouseOnCanvas) return;
        const mainCanvas = canvasRef.current;
        const magCanvas = magnifierCanvasRef.current;
        if (!mainCanvas || !magCanvas) return;

        const magCtx = magCanvas.getContext('2d');
        if (!magCtx) return;

        magCtx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
        magCtx.imageSmoothingEnabled = false;

        const sx = canvasMousePos.x - (MAGNIFIER_SIZE / MAGNIFIER_ZOOM / 2);
        const sy = canvasMousePos.y - (MAGNIFIER_SIZE / MAGNIFIER_ZOOM / 2);
        const sWidth = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;
        const sHeight = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;

        magCtx.drawImage(
            mainCanvas,
            sx, sy, sWidth, sHeight,
            0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE
        );

        magCtx.strokeStyle = 'red';
        magCtx.lineWidth = 1;
        magCtx.beginPath();
        magCtx.moveTo(MAGNIFIER_SIZE / 2, 0);
        magCtx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
        magCtx.moveTo(0, MAGNIFIER_SIZE / 2);
        magCtx.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
        magCtx.stroke();

    }, [isMagnifierVisible, isMouseOnCanvas, canvasMousePos]);

    useEffect(() => {
        drawMagnifier();
    }, [canvasMousePos, drawMagnifier]);


    const convertStandardYoloToInternal = useCallback((standardYoloContent: string, file_classMap: { [key: number]: ClassInfo }): string => {
        const lines = standardYoloContent.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return '';
        const firstLineParts = lines[0].split(' ');
        if (firstLineParts.length !== 5 || isNaN(parseFloat(firstLineParts[0]))) {
            return standardYoloContent;
        }
        const nameCounters: { [key: string]: number } = {};
        const internalYoloLines = lines.map(line => {
            const parts = line.split(' ');
            if (parts.length !== 5) return line;
            const classIndex = parseInt(parts[0], 10);
            if (isNaN(classIndex)) return line;
            const classLabel = file_classMap[classIndex]?.label || `class_${classIndex}`;
            const counter = nameCounters[classLabel] || 0;
            nameCounters[classLabel] = counter + 1;
            const uniqueName = `${classLabel}_${counter}`;
            return `${uniqueName} ${line}`;
        });
        return internalYoloLines.join('\n');
    }, []);

    const loadDataForIndex = useCallback(async (index: number, signal: AbortSignal) => {
        setIsTransitioning(true);
        try {
            const imageKey = imageKeys[index];
            if (!imageKey) throw new Error("无效的图片索引");

            const sourceData = await workspaceService.loadDataForImage(imageKey);
            if (signal.aborted) return;

            const imageElement = await preloadImage(sourceData.pngFile, signal);
            if (signal.aborted) return;

            const dirtyYolo = file_dirtyYolo[imageKey];
            const dirtyJson = file_dirtyJson[imageKey];
            const yoloToLoad = dirtyYolo ?? sourceData.yoloContent ?? '';
            const jsonToLoad = dirtyJson ?? sourceData.jsonContent ?? '{}';

            const internalYolo = convertStandardYoloToInternal(yoloToLoad, file_classMap);
            setCurrentYoloContent(internalYolo);
            setCurrentJsonContent(jsonToLoad);

            try {
                const fullData = JSON.parse(jsonToLoad);
                setNetlistScsContent(fullData.netlist_scs || null);
                setNetlistCdlContent(fullData.netlist_cdl || null);
            } catch {
                setNetlistScsContent(null);
                setNetlistCdlContent(null);
            }

            const details: ImageDetails = {
                name: imageKey,
                element: imageElement,
                width: imageElement.width,
                height: imageElement.height,
                originalFile: sourceData.pngFile,
            };
            setCurrentImageDetails(details);

        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                console.log(`[Bedrock] 事务 (索引 ${index}) 已被成功中止。`);
            } else {
                console.error(`加载索引 ${index} 数据失败:`, error);
                message.error(`加载数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        } finally {
            if (!signal.aborted) {
                setIsTransitioning(false);
            }
        }
    }, [imageKeys, file_classMap, file_dirtyYolo, file_dirtyJson, convertStandardYoloToInternal]);

    const handleNavigation = useCallback(async (offset: number) => {
        if (isAppBusy) return;
        const newIndex = file_currentIndex + offset;
        if (newIndex >= 0 && newIndex < imageKeys.length) {
            if (currentImageKey) {
                setFile_dirtyYolo(prev => ({ ...prev, [currentImageKey]: currentYoloContent || '' }));
                setFile_dirtyJson(prev => ({ ...prev, [currentImageKey]: currentJsonContent || '{}' }));
            }
            await workspaceService.saveLastIndices({ fileOperateIndex: newIndex });
            setFile_currentIndex(newIndex);
        }
    }, [isAppBusy, file_currentIndex, imageKeys.length, currentImageKey, currentYoloContent, currentJsonContent, setFile_dirtyYolo, setFile_dirtyJson, setFile_currentIndex]);

    const handleNavigateToIndex = useCallback(async (index: number) => {
        if (isAppBusy || file_currentIndex === index) return;
        if (index >= 0 && index < imageKeys.length) {
            if (currentImageKey) {
                setFile_dirtyYolo(prev => ({ ...prev, [currentImageKey]: currentYoloContent || '' }));
                setFile_dirtyJson(prev => ({ ...prev, [currentImageKey]: currentJsonContent || '{}' }));
            }
            await workspaceService.saveLastIndices({ fileOperateIndex: index });
            setFile_currentIndex(index);
        }
    }, [isAppBusy, file_currentIndex, imageKeys.length, currentImageKey, currentYoloContent, currentJsonContent, setFile_dirtyYolo, setFile_dirtyJson, setFile_currentIndex]);

    useEffect(() => {
        if (!hasWorkspace || file_currentIndex < 0) {
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setAppBusy(true);

        loadDataForIndex(file_currentIndex, controller.signal).finally(() => {
            if (!controller.signal.aborted) {
                setAppBusy(false);
            }
        });

        return () => {
            controller.abort();
        }
    }, [file_currentIndex, hasWorkspace, loadDataForIndex, setAppBusy]);


    useEffect(() => { redrawCanvas(); }, [redrawCanvas, redrawTrigger]);
    useEffect(() => {
        const handleResize = () => setRedrawTrigger(p => p + 1);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: globalThis.MouseEvent) => {
            if (!isResizingInspector && !isResizingExplorer) return;
            if(isResizingInspector){
                const newWidth = window.innerWidth - e.clientX;
                if (newWidth > 200 && newWidth < 800) setInspectorWidth(newWidth);
            }
            if(isResizingExplorer){
                const newWidth = e.clientX - 60;
                if (newWidth > 150 && newWidth < 600) setExplorerWidth(newWidth);
            }
        };
        const handleMouseUp = () => {
            setIsResizingInspector(false);
            setIsResizingExplorer(false);
        };

        if (isResizingInspector || isResizingExplorer) {
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingInspector, isResizingExplorer]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
            if (draggingState?.type === 'magnifier-drag' && draggingState.offset) {
                setMagnifierPos({
                    x: e.clientX - draggingState.offset.x,
                    y: e.clientY - draggingState.offset.y
                });
            }
        };

        const handleGlobalMouseUp = () => {
            if (draggingState?.type === 'magnifier-drag') {
                setDraggingState(null);
            }
        };

        if (draggingState?.type === 'magnifier-drag') {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [draggingState]);

    const handleDeleteAnnotationByName = useCallback((boxNameToDelete: string) => {
        if (!boxNameToDelete) return;

        const previousYoloContentForUndo = currentYoloContent;
        const previousJsonContentForUndo = currentJsonContent;

        const allLines = (currentYoloContent || '').split('\n');
        const deletedLineContent = allLines.find(line => line.startsWith(boxNameToDelete + ' '));
        const deletedLineIndex = allLines.findIndex(line => line.startsWith(boxNameToDelete + ' '));

        const newYoloLines = allLines.filter(line => !line.startsWith(boxNameToDelete + ' '));
        const newYoloContent = newYoloLines.join('\n');

        setCurrentYoloContent(newYoloContent);

        let newJsonContent = currentJsonContent;
        if (currentJsonContent) {
            const parsedJson = parseJsonContent(currentJsonContent);
            Object.keys(parsedJson.local).forEach(typeKey => {
                const typeDict = parsedJson.local[typeKey];
                Object.keys(typeDict).forEach(nameKey => {
                    typeDict[nameKey] = typeDict[nameKey].filter(
                        (bName: string) => bName !== boxNameToDelete
                    );
                });
            });
            newJsonContent = stringifyJsonContent(parsedJson);
            setCurrentJsonContent(newJsonContent);
        }

        if (deletedLineContent) {
            const newOp: Operation = {
                type: 'delete',
                deletedLines: [{ index: deletedLineIndex, content: deletedLineContent }],
                previousYoloContent: previousYoloContentForUndo,
                previousJsonContent: previousJsonContentForUndo,
            };
            setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
            setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
        }

        if (selectedBoxName === boxNameToDelete) {
            setSelectedBoxName(null);
        }

        message.success(`标注 '${boxNameToDelete}' 已删除`);
        setRedrawTrigger(p => p + 1);
    }, [currentYoloContent, currentJsonContent, file_currentIndex, selectedBoxName, setFile_operationHistory, setFile_redoHistory]);


    const handleCanvasAction = (e: MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current; if (!canvas || !currentYoloContent) return;
        const { x: mouseX, y: mouseY } = getScaledCoords(e);

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
                        if (!jsonObj.local[selectedJsonType!]) {
                            jsonObj.local[selectedJsonType!] = {};
                        }
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
                    setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
                    setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
                    setRedrawTrigger(p => p + 1);
                    break;
                }
            }
        } else if (activeTool === 'delete') {
            let boxNameToDelete: string | null = null;
            for (let i = yoloLines.length - 1; i >= 0; i--) {
                const line = yoloLines[i];
                const parts = line.split(' ');
                if (parts.length < 6) continue;
                const [, relX, relY, relW, relH] = parts.slice(1).map(parseFloat);
                const absLeft = (relX - relW / 2) * canvas.width; const absTop = (relY - relH / 2) * canvas.height;
                const absW = relW * canvas.width; const absH = relH * canvas.height;
                if (mouseX >= absLeft && mouseX <= absLeft + absW && mouseY >= absTop && mouseY <= absTop + absH) {
                    boxNameToDelete = parts[0];
                    break;
                }
            }
            if (boxNameToDelete) {
                handleDeleteAnnotationByName(boxNameToDelete);
            }
        }
    };

    const handleMagnifierMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const { clientX, clientY } = e;
        setDraggingState({
            type: 'magnifier-drag',
            startMousePos: { x: clientX, y: clientY },
            offset: { x: clientX - magnifierPos.x, y: clientY - magnifierPos.y }
        });
    };

    const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;

        if (activeTool === 'stain' || activeTool === 'delete') {
            handleCanvasAction(e);
            return;
        }

        const canvas = canvasRef.current; if (!canvas) return;
        const startPos = getScaledCoords(e);

        if (activeTool === 'draw') {
            setMouseDownCoords(startPos);
            setIsDrawing(true);
            const ctx = canvas.getContext('2d');
            if (ctx) setCanvasImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        } else if (activeTool === 'region-delete') {
            setDraggingState({ type: 'region-select', startMousePos: startPos });
        } else if (activeTool === 'select') {
            const yoloLines = currentYoloContent?.split('\n').filter(Boolean) || [];

            const selectedBoxLine = yoloLines.find(line => line.startsWith(selectedBoxName + ' '));
            if (selectedBoxName && selectedBoxLine) {
                const parts = selectedBoxLine.split(' ').slice(1).map(parseFloat);
                const [, relX, relY, relW, relH] = parts;
                const absW = relW * canvas.width, absH = relH * canvas.height;
                const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
                const handles = getResizeHandles({ x: absLeft, y: absTop, width: absW, height: absH });

                for (const handleKey of Object.keys(handles) as ResizeHandle[]) {
                    const handle = handles[handleKey];
                    if (startPos.x >= handle.x && startPos.x <= handle.x + handle.size && startPos.y >= handle.y && startPos.y <= handle.y + handle.size) {
                        setDraggingState({
                            type: 'resize',
                            boxName: selectedBoxName,
                            handle: handleKey,
                            startMousePos: startPos,
                            startAbsBox: { x: absLeft, y: absTop, w: absW, h: absH },
                            startFullYoloLine: selectedBoxLine
                        });
                        const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent };
                        setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
                        setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
                        return;
                    }
                }
            }

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

                if (startPos.x >= absLeft && startPos.x <= absLeft + absW && startPos.y >= absTop && startPos.y <= absTop + absH) {
                    clickedBox = name;
                    clickedYoloData = { relX, relY };
                    break;
                }
            }

            setSelectedBoxName(clickedBox);
            if (clickedBox && clickedYoloData) {
                setDraggingState({
                    type: 'move',
                    boxName: clickedBox,
                    startMousePos: startPos,
                    startYoloData: clickedYoloData,
                });
                const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent };
                setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
                setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
            } else {
                setDraggingState(null);
            }
        }
    };

    const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current; if (!canvas) return;
        const currentPos = getScaledCoords(e);
        setCanvasMousePos(currentPos);

        if (isDrawing && activeTool === 'draw') {
            const ctx = canvas.getContext('2d');
            if (ctx && canvasImageData) {
                ctx.putImageData(canvasImageData, 0, 0); ctx.beginPath();
                ctx.strokeStyle = file_classMap[currentClassIndex]?.color || '#262626';
                ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
                ctx.rect(mouseDownCoords.x, mouseDownCoords.y, currentPos.x - mouseDownCoords.x, currentPos.y - mouseDownCoords.y);
                ctx.stroke(); ctx.setLineDash([]);
            }
        } else if (draggingState) {
            if (draggingState.type === 'region-select') {
                setRegionSelectBox({ start: draggingState.startMousePos, end: currentPos });
                setRedrawTrigger(p => p + 1);
            } else if (activeTool === 'select') {
                if (draggingState.type === 'move' && draggingState.startYoloData) {
                    const dx = (currentPos.x - draggingState.startMousePos.x) / canvas.width;
                    const dy = (currentPos.y - draggingState.startMousePos.y) / canvas.height;
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
                    const dx = currentPos.x - draggingState.startMousePos.x;
                    const dy = currentPos.y - draggingState.startMousePos.y;
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
            }
        } else if (activeTool === 'select') {
            let newHoveredHandle: ResizeHandle | null = null;
            if (selectedBoxName) {
                const yoloLines = (currentYoloContent || '').split('\n');
                const selectedLine = yoloLines.find(line => line.startsWith(selectedBoxName + ' '));
                if (selectedLine) {
                    const [, relX, relY, relW, relH] = selectedLine.split(' ').slice(1).map(parseFloat);
                    const absW = relW * canvas.width, absH = relH * canvas.height;
                    const absLeft = (relX - relW / 2) * canvas.width, absTop = (relY - relH / 2) * canvas.height;
                    const handles = getResizeHandles({ x: absLeft, y: absTop, width: absW, height: absH });
                    for (const handleKey of Object.keys(handles) as ResizeHandle[]) {
                        const handle = handles[handleKey];
                        if (currentPos.x >= handle.x && currentPos.x <= handle.x + handle.size && currentPos.y >= handle.y && currentPos.y <= handle.y + handle.size) {
                            newHoveredHandle = handleKey;
                            break;
                        }
                    }
                }
            }
            setHoveredHandle(newHoveredHandle);
        } else {
            if (hoveredHandle !== null) setHoveredHandle(null);
        }
    };

    const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const upPos = getScaledCoords(e);

        if (isDrawing && activeTool === 'draw') {
            setIsDrawing(false);
            const x1 = Math.min(mouseDownCoords.x, upPos.x); const y1 = Math.min(mouseDownCoords.y, upPos.y);
            const width = Math.abs(upPos.x - mouseDownCoords.x); const height = Math.abs(upPos.y - mouseDownCoords.y);

            if (width > 2 && height > 2) {
                const classLabel = file_classMap[currentClassIndex]?.label || `class_${currentClassIndex}`;
                const yoloLines = currentYoloContent?.split('\n').filter(l => l.trim() !== '') || [];

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
                setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
                setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
            }
            setCanvasImageData(null); setRedrawTrigger(prev => prev + 1);
        } else if (draggingState && draggingState.type === 'region-select') {
            const start = draggingState.startMousePos;
            const end = upPos;
            const selRect = {
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: Math.abs(start.x - end.x),
                height: Math.abs(start.y - end.y),
            };

            const boxNamesToDelete: string[] = [];
            parsedYoloData.forEach(item => {
                const boxRect = {
                    width: item.w * canvas.width,
                    height: item.h * canvas.height,
                    x: (item.x - item.w / 2) * canvas.width,
                    y: (item.y - item.h / 2) * canvas.height
                };

                let shouldDelete = false;
                if (regionDeleteMode === 'contain') {
                    shouldDelete = (
                        boxRect.x >= selRect.x &&
                        boxRect.y >= selRect.y &&
                        boxRect.x + boxRect.width <= selRect.x + selRect.width &&
                        boxRect.y + boxRect.height <= selRect.y + selRect.height
                    );
                } else { // 'intersect' mode
                    shouldDelete = !(
                        boxRect.x > selRect.x + selRect.width ||
                        boxRect.x + boxRect.width < selRect.x ||
                        boxRect.y > selRect.y + selRect.height ||
                        boxRect.y + boxRect.height < selRect.y
                    );
                }

                if (shouldDelete) {
                    boxNamesToDelete.push(item.name);
                }
            });

            if (boxNamesToDelete.length > 0) {
                const previousYoloContentForUndo = currentYoloContent;
                const previousJsonContentForUndo = currentJsonContent;

                const allLines = (currentYoloContent || '').split('\n');
                const deletedLines: { index: number, content: string }[] = [];

                const newYoloLines = allLines.filter((line, index) => {
                    const name = line.split(' ')[0];
                    if (boxNamesToDelete.includes(name)) {
                        deletedLines.push({ index, content: line });
                        return false;
                    }
                    return true;
                });
                const newYoloContent = newYoloLines.join('\n');
                setCurrentYoloContent(newYoloContent);

                let newJsonContent = currentJsonContent;
                if (currentJsonContent) {
                    const parsedJson = parseJsonContent(currentJsonContent);
                    Object.keys(parsedJson.local).forEach(typeKey => {
                        const typeDict = parsedJson.local[typeKey];
                        Object.keys(typeDict).forEach(nameKey => {
                            typeDict[nameKey] = typeDict[nameKey].filter(
                                (bName: string) => !boxNamesToDelete.includes(bName)
                            );
                        });
                    });
                    newJsonContent = stringifyJsonContent(parsedJson);
                    setCurrentJsonContent(newJsonContent);
                }

                const newOp: Operation = {
                    type: 'delete',
                    deletedLines: deletedLines,
                    previousYoloContent: previousYoloContentForUndo,
                    previousJsonContent: previousJsonContentForUndo,
                };
                setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
                setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
                message.success(`删除了 ${boxNamesToDelete.length} 个标注。`);
            }
        }
        setDraggingState(null);
        setRegionSelectBox(null);
        setRedrawTrigger(p => p + 1);
    };

    const addUndoRecord = useCallback(() => {
        const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent };
        setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
        setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
    }, [currentYoloContent, file_currentIndex, setFile_operationHistory, setFile_redoHistory]);

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
                parts[propIndex + 1] = (value as number).toFixed(6);
                return parts.join(' ');
            }
            return line;
        }).join('\n');
        setCurrentYoloContent(newYoloContent);
    }, [currentYoloContent]);

    const handleUndo = () => {
        const currentImageHistory = file_operationHistory[file_currentIndex] || [];
        if (currentImageHistory.length === 0) { message.info(t.noUndoOperations); return; }
        const lastOperation = currentImageHistory[currentImageHistory.length - 1];
        let redoOp: Operation;
        switch (lastOperation.type) { case 'draw': case 'ai_annotate': case 'move': redoOp = { ...lastOperation, previousYoloContent: currentYoloContent }; break; case 'stain': case 'json_change': redoOp = { ...lastOperation, previousJsonContent: currentJsonContent }; break; case 'delete': redoOp = { ...lastOperation, previousYoloContent: currentYoloContent, previousJsonContent: currentJsonContent }; break; default: return; }
        setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [redoOp, ...(prev[file_currentIndex] || [])] }));
        setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: currentImageHistory.slice(0, -1) }));
        if ('previousYoloContent' in lastOperation) { setCurrentYoloContent(lastOperation.previousYoloContent); }
        if ('previousJsonContent' in lastOperation) { setCurrentJsonContent(lastOperation.previousJsonContent); }
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful);
    };
    const handleRedo = () => {
        const currentImageRedoHistory = file_redoHistory[file_currentIndex] || [];
        if (currentImageRedoHistory.length === 0) { message.info(t.noRedoOperations); return; }
        const operationToRedo = currentImageRedoHistory[0];
        let undoOp: Operation;
        switch (operationToRedo.type) { case 'draw': case 'ai_annotate': case 'move': undoOp = { ...operationToRedo, previousYoloContent: currentYoloContent }; break; case 'stain': case 'json_change': undoOp = { ...operationToRedo, previousJsonContent: currentJsonContent }; break; case 'delete': undoOp = { ...operationToRedo, previousYoloContent: currentYoloContent, previousJsonContent: currentJsonContent }; break; default: return; }
        setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), undoOp] }));
        setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: currentImageRedoHistory.slice(1) }));
        if ('previousYoloContent' in operationToRedo) { setCurrentYoloContent(operationToRedo.previousYoloContent); }
        if ('previousJsonContent' in operationToRedo) { setCurrentJsonContent(operationToRedo.previousJsonContent); }
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful);
    };

    const handleAiAnnotation = async () => {
        if (!currentImageDetails || !canvasRef.current) { message.warning(t.noFile); return; }
        if (isAppBusy) { message.warning("应用正忙，请稍后再试。"); return; }

        setIsAiAnnotating(true);
        setAppBusy(true);
        message.loading({ content: t.aiAnnotating, key: 'ai-annotation', duration: 0 });

        try {
            const formData = new FormData();
            formData.append('file', currentImageDetails.originalFile, currentImageDetails.name);

            const response = await fetch('http://111.229.103.50:8199/process/', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorDetail = `HTTP error! status: ${response.status}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorDetail = errorJson.detail || errorText;
                } catch (e) { errorDetail = errorText || errorDetail; }
                throw new Error(errorDetail);
            }

            const resultData: FullApiResponse = await response.json();

            if (!resultData || !resultData.cpnts || resultData.cpnts.length === 0) {
                message.info({ content: "AI 未返回任何有效标注。", key: 'ai-annotation', duration: 3 });
                return;
            }

            const previousYolo = currentYoloContent;

            const { width, height } = canvasRef.current;

            const newLabels = [...new Set(resultData.cpnts.map(c => c.type))];
            const existingLabels = Object.values(file_classMap).map(c => c.label);
            const newlyDiscovered = newLabels.filter(l => !existingLabels.includes(l));

            let currentClassMap = file_classMap;
            if (newlyDiscovered.length > 0) {
                let newClassMap = { ...file_classMap };
                let lastIndex = Object.keys(file_classMap).length > 0 ? Math.max(...Object.keys(file_classMap).map(Number)) : -1;
                newlyDiscovered.forEach(label => {
                    lastIndex++;
                    newClassMap[lastIndex] = { label, color: generateRandomColor() };
                });
                setFile_classMap(newClassMap);
                currentClassMap = newClassMap;
            }

            const newYoloContent = convertCpntsToYolo(resultData.cpnts, width, height, currentClassMap);

            if (!newYoloContent) {
                message.info({ content: "AI 未返回可解析的标注。", key: 'ai-annotation', duration: 3 });
                return;
            }

            const displayData: { [key: string]: any } = {};
            const allowedKeys = ['cpnts', 'key_points', 'ports', 'segments', 'schematic_h', 'schematic_w', 'name'];
            allowedKeys.forEach(key => { if (key in resultData) { displayData[key] = (resultData as any)[key]; } });
            const displayJsonContent = JSON.stringify(displayData, null, 2);


            setCurrentYoloContent(newYoloContent);
            setCurrentJsonContent(displayJsonContent);
            setNetlistScsContent(resultData.netlist_scs || '');
            setNetlistCdlContent(resultData.netlist_cdl || '');

            const newOp: Operation = { type: 'ai_annotate', yoloData: (newYoloContent || '').split('\n'), previousYoloContent: previousYolo };
            setFile_operationHistory(prev => ({ ...prev, [file_currentIndex]: [...(prev[file_currentIndex] || []), newOp] }));
            setFile_redoHistory(prev => ({ ...prev, [file_currentIndex]: [] }));
            setRedrawTrigger(p => p + 1);
            message.success({ content: t.operationSuccessful, key: 'ai-annotation' });

        } catch (error: any) {
            console.error("AI Annotation failed:", error);
            message.error({ content: `${t.aiFailed}: ${error.message}`, key: 'ai-annotation', duration: 5 });
        } finally {
            setIsAiAnnotating(false);
            setAppBusy(false);
        }
    };

    const handleAddClass = () => { const existingIndices = Object.keys(file_classMap).map(Number); const newIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0; setFile_classMap(prev => ({ ...prev, [newIndex]: { label: 'new_class', color: generateRandomColor() } })); };
    const handleUpdateClass = (index: number, field: 'label' | 'color', value: string) => { setFile_classMap(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } })); };
    const handleDeleteClass = (indexToDelete: number) => { const title = t.deleteClassConfirmTitle ? t.deleteClassConfirmTitle.replace('%s', `[${indexToDelete}] ${file_classMap[indexToDelete]?.label}`) : `确认删除类别 [${indexToDelete}] ${file_classMap[indexToDelete]?.label}?`; Modal.confirm({ title: title, content: t.deleteClassConfirmContent, okText: t.confirmDelete, cancelText: t.cancel, okType: 'danger', onOk: () => { const newClassMap = { ...file_classMap }; delete newClassMap[indexToDelete]; setFile_classMap(newClassMap); if (currentClassIndex === indexToDelete) { const firstKey = Object.keys(newClassMap)[0]; setCurrentClassIndex(firstKey ? parseInt(firstKey) : 0); } message.success(t.classDeleted.replace('%s', file_classMap[indexToDelete]?.label || '')); } }); };

    const handleExportClasses = () => {
        const exportObj: { [key: string]: string } = {};
        for (const key in file_classMap) { exportObj[key] = file_classMap[key].label; }
        const classText = `classes = ${JSON.stringify(exportObj, null, 4)}`;
        const blob = new Blob([classText], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, 'classes.txt');
    };

    const handleImportClasses = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            try {
                const jsonStringMatch = text.match(/=\s*({[\s\S]*})/);
                if (!jsonStringMatch || !jsonStringMatch[1]) throw new Error("无效格式：找不到对象字面量 '{...}'。");

                const jsonString = jsonStringMatch[1];
                const parsedObject = new Function(`return ${jsonString}`)();

                if (typeof parsedObject !== 'object' || parsedObject === null) throw new Error("解析的内容不是有效的对象。");

                const newClassMap: { [key: number]: ClassInfo } = {};
                let hasEntries = false;
                for (const key in parsedObject) {
                    if (Object.prototype.hasOwnProperty.call(parsedObject, key)) {
                        const index = parseInt(key, 10);
                        const label = parsedObject[key];
                        if (!isNaN(index) && typeof label === 'string') {
                            newClassMap[index] = { label, color: generateRandomColor() };
                            hasEntries = true;
                        }
                    }
                }
                if (!hasEntries) throw new Error("在文件中未找到有效的类别条目。");

                setFile_classMap(newClassMap);
                const firstKey = Object.keys(newClassMap)[0];
                setCurrentClassIndex(firstKey ? parseInt(firstKey) : 0);

                message.success(`成功导入 ${Object.keys(newClassMap).length} 个类别。`);
            } catch (error: any) {
                console.error("导入类别失败:", error);
                message.error(`导入类别失败: ${error.message}`);
            }
        };
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const getOperationDescription = useCallback((op: Operation): string => {
        switch (op.type) {
            case 'draw': return t.opDraw.replace('%s', op.yoloData.map(line => line.split(' ')[0]).join(', '));
            case 'ai_annotate': return t.opAi.replace('%s', String(op.yoloData.length));
            case 'stain': return t.opStain.replace('%s', op.boxName);
            case 'delete': return t.opDelete.replace('%s', op.deletedLines.map(l => l.content.split(' ')[0]).join(', '));
            case 'json_change': return t.opJson;
            case 'move': return t.opMove;
            default: return 'Unknown Operation';
        }
    }, [t]);

    const isSelectedForEdit = (item: { name: string }) => activeTool === 'select' && item.name === selectedBoxName;

    const getCanvasCursor = () => {
        if (isMagnifierVisible) return 'none';
        switch (activeTool) {
            case 'delete': return 'delete-cursor';
            case 'draw': return 'draw-cursor';
            case 'region-delete': return 'draw-cursor';
            case 'select': return getCursorForHandle(hoveredHandle);
            default: return 'default';
        }
    }

    const propertiesToObject = (props: Property[] | undefined) => {
        if (!props) return {};
        return props.reduce((acc, prop) => {
            if (prop && prop.key) {
                acc[prop.key] = prop.value;
            }
            return acc;
        }, {} as { [key: string]: any });
    };

    const handleNodeAction = async (action: 'create' | 'update' | 'delete' | 'find') => {
        setAppBusy(true);
        try {
            await nodeForm.validateFields(['name']);
            const values = nodeForm.getFieldsValue();
            const { name } = values;
            const properties = propertiesToObject(values.properties);

            switch (action) {
                case 'create':
                    await createNode({ name, properties });
                    break;
                case 'update':
                    await updateNode({ name, properties });
                    break;
                case 'delete':
                    await deleteNode({ name });
                    break;
                case 'find':
                    const result = await findNode({ name });
                    const foundNode = result?.data;
                    if (foundNode?.name) {
                        message.success(`节点 "${name}" 已找到`);
                    } else {
                        message.warning(result?.message || `节点 "${name}" 不存在`);
                    }
                    break;
            }
        } catch (errorInfo) {
            console.log('表单验证失败:', errorInfo);
        } finally {
            setAppBusy(false);
        }
    };

    const handleRelationshipAction = async (action: 'create' | 'update' | 'delete' | 'find') => {
        setAppBusy(true);
        try {
            await relationshipForm.validateFields(['name']);
            const values = relationshipForm.getFieldsValue();
            const { name } = values;
            const properties = propertiesToObject(values.properties);

            switch (action) {
                case 'create':
                    if (!properties.fromNode || !properties.toNode) {
                        message.warning('创建关系必须在属性中指定 fromNode 和 toNode');
                        setAppBusy(false);
                        return;
                    }
                    await createRelationship({ name, properties });
                    break;
                case 'update':
                    await updateRelationship({ name, properties });
                    break;
                case 'delete':
                    await deleteRelationship({ name });
                    break;
                case 'find':
                    const result = await findRelationship({ name });
                    if (result?.data?.name) {
                        message.success(`关系 "${name}" 已找到`);
                    } else {
                        message.warning(result?.message || `关系 "${name}" 不存在`);
                    }
                    break;
            }
        } catch (errorInfo) {
            console.log('表单验证失败:', errorInfo);
        } finally {
            setAppBusy(false);
        }
    };

    const handleAddComponent = () => {
        if (newComponentName && !file_kgComponentMap[newComponentName]) {
            setFile_kgComponentMap(prev => ({
                ...prev,
                [newComponentName]: { color: generateRandomColor() }
            }));
            message.success(`组件 '${newComponentName}' 已添加`);
            setNewComponentName('');
        } else if (file_kgComponentMap[newComponentName]) {
            message.warning(`组件 '${newComponentName}' 已存在`);
        }
    };

    const handleUpdateKgComponent = (oldName: string, field: 'name' | 'color', value: string) => {
        if (field === 'color') {
            setFile_kgComponentMap(prev => ({ ...prev, [oldName]: { ...prev[oldName], color: value } }));
            return;
        }

        const newName = value;
        if (!newName || newName === oldName) return;
        if (file_kgComponentMap[newName]) {
            message.error(`组件名 "${newName}" 已存在。`);
            return;
        }

        Modal.confirm({
            title: `确认重命名组件 "${oldName}" 为 "${newName}"?`,
            content: `此操作将更新所有图片中对该组件的引用，且无法撤销。`,
            okText: t.confirmDelete,
            cancelText: t.cancel,
            onOk: () => {
                setAppBusy(true);
                const updatedMap = { ...file_kgComponentMap };
                updatedMap[newName] = updatedMap[oldName];
                delete updatedMap[oldName];
                setFile_kgComponentMap(updatedMap);

                const updatedDirtyJson: { [key: string]: string } = {};
                Object.entries(file_dirtyJson).forEach(([key, jsonStr]) => {
                    const data = parseJsonContent(jsonStr);
                    let wasUpdated = false;
                    Object.values(data.local).forEach(typeDict => {
                        if (typeDict[oldName]) {
                            typeDict[newName] = typeDict[oldName];
                            delete typeDict[oldName];
                            wasUpdated = true;
                        }
                    });
                    updatedDirtyJson[key] = wasUpdated ? stringifyJsonContent(data) : jsonStr;
                });
                setFile_dirtyJson(updatedDirtyJson);
                if (selectedJsonName === oldName) {
                    setSelectedJsonName(newName);
                }
                message.success(`组件已重命名为 "${newName}"`);
                setAppBusy(false);
            }
        });
    };

    const handleDeleteKgComponent = (nameToDelete: string) => {
        Modal.confirm({
            title: t.deleteComponentConfirmTitle.replace('%s', nameToDelete),
            content: t.deleteComponentConfirmContent,
            okText: t.confirmDelete,
            cancelText: t.cancel,
            okType: 'danger',
            onOk: () => {
                setAppBusy(true);
                const updatedMap = { ...file_kgComponentMap };
                delete updatedMap[nameToDelete];
                setFile_kgComponentMap(updatedMap);

                const updatedDirtyJson: { [key: string]: string } = {};
                Object.entries(file_dirtyJson).forEach(([key, jsonStr]) => {
                    const data = parseJsonContent(jsonStr);
                    let wasUpdated = false;
                    Object.values(data.local).forEach(typeDict => {
                        if (typeDict[nameToDelete]) {
                            delete typeDict[nameToDelete];
                            wasUpdated = true;
                        }
                    });
                    updatedDirtyJson[key] = wasUpdated ? stringifyJsonContent(data) : jsonStr;
                });
                setFile_dirtyJson(updatedDirtyJson);

                if (selectedJsonName === nameToDelete) {
                    setSelectedJsonName(null);
                }
                message.success(t.componentDeleted.replace('%s', nameToDelete));
                setAppBusy(false);
            }
        });
    };

    const handleAddComponentType = () => {
        if (newComponentType && !file_kgTypeMap.includes(newComponentType)) {
            setFile_kgTypeMap(prev => [...prev, newComponentType]);
            message.success(`类型 '${newComponentType}' 已添加`);
            setNewComponentType('');
        } else if (file_kgTypeMap.includes(newComponentType)) {
            message.warning(`类型 '${newComponentType}' 已存在`);
        }
    };

    const handleUpdateKgType = (oldType: string, newType: string) => {
        if (!newType || newType === oldType) return;
        if (file_kgTypeMap.includes(newType)) {
            message.error(`类型 "${newType}" 已存在。`);
            return;
        }

        Modal.confirm({
            title: `确认重命名类型 "${oldType}" 为 "${newType}"?`,
            content: `此操作将更新所有图片中对该类型的引用，且无法撤销。`,
            okText: t.confirmDelete,
            cancelText: t.cancel,
            onOk: () => {
                setAppBusy(true);
                setFile_kgTypeMap(prev => prev.map(t => t === oldType ? newType : t));

                const updatedDirtyJson: { [key: string]: string } = {};
                Object.entries(file_dirtyJson).forEach(([key, jsonStr]) => {
                    const data = parseJsonContent(jsonStr);
                    if (data.local[oldType]) {
                        data.local[newType] = data.local[oldType];
                        delete data.local[oldType];
                        updatedDirtyJson[key] = stringifyJsonContent(data);
                    } else {
                        updatedDirtyJson[key] = jsonStr;
                    }
                });
                setFile_dirtyJson(updatedDirtyJson);

                if (selectedJsonType === oldType) {
                    setSelectedJsonType(newType);
                }
                message.success(`类型已重命名为 "${newType}"`);
                setAppBusy(false);
            }
        });
    };

    const handleDeleteKgType = (typeToDelete: string) => {
        Modal.confirm({
            title: t.deleteTypeConfirmTitle.replace('%s', typeToDelete),
            content: t.deleteTypeConfirmContent,
            okText: t.confirmDelete,
            cancelText: t.cancel,
            okType: 'danger',
            onOk: () => {
                setAppBusy(true);
                setFile_kgTypeMap(prev => prev.filter(t => t !== typeToDelete));

                const updatedDirtyJson: { [key: string]: string } = {};
                Object.entries(file_dirtyJson).forEach(([key, jsonStr]) => {
                    const data = parseJsonContent(jsonStr);
                    if (data.local[typeToDelete]) {
                        delete data.local[typeToDelete];
                        updatedDirtyJson[key] = stringifyJsonContent(data);
                    } else {
                        updatedDirtyJson[key] = jsonStr;
                    }
                });
                setFile_dirtyJson(updatedDirtyJson);

                if (selectedJsonType === typeToDelete) {
                    setSelectedJsonType(null);
                }
                message.success(t.typeDeleted.replace('%s', typeToDelete));
                setAppBusy(false);
            }
        });
    };


    const renderPropertiesEditor = () => (
        <Form.List name="properties">
            {(fields, { add, remove }) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fields.map(({ key, name, ...restField }) => (
                        <Space key={key} style={{ display: 'flex' }} align="baseline">
                            <Form.Item {...restField} name={[name, 'key']} style={{ flex: 1, marginBottom: 0 }}>
                                <Input placeholder={t.propKey} />
                            </Form.Item>
                            <Form.Item {...restField} name={[name, 'value']} style={{ flex: 1, marginBottom: 0 }}>
                                <Input placeholder={t.propValue} />
                            </Form.Item>
                            <Button type="text" danger icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => remove(name)} />
                        </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<FontAwesomeIcon icon={faPlus} />}>
                        {t.addProperty}
                    </Button>
                </div>
            )}
        </Form.List>
    );

    return (
        <Layout className="unified-layout">
            <Header className="unified-top-header">
                <div className="header-left-controls">
                    {!isExplorerVisible && (
                        <Tooltip title={t.showExplorer} placement="right">
                            <Button icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsExplorerVisible(true)} />
                        </Tooltip>
                    )}
                </div>
                <Space className="header-center-controls">
                    <Button onClick={() => handleNavigation(-1)} disabled={file_currentIndex === 0 || !hasWorkspace || disabledUI} icon={<FontAwesomeIcon icon={faArrowLeft} />} />
                    <Text className="current-file-text" title={currentImageDetails?.name}>{currentImageDetails ? `${t.currentFile}: ${currentImageDetails.name} (${file_currentIndex + 1}/${imageKeys.length})` : t.noImages}</Text>
                    <Button onClick={() => handleNavigation(1)} disabled={file_currentIndex >= imageKeys.length - 1 || !hasWorkspace || disabledUI} icon={<FontAwesomeIcon icon={faArrowRight} />} />
                </Space>
                <div className="header-right-controls">
                    <Tooltip title={t.undo}><Button onClick={handleUndo} icon={<FontAwesomeIcon icon={faUndo} />} disabled={(file_operationHistory[file_currentIndex] || []).length === 0 || disabledUI} /></Tooltip>
                    <Tooltip title={t.redo}><Button onClick={handleRedo} icon={<FontAwesomeIcon icon={faRedo} />} disabled={(file_redoHistory[file_currentIndex] || []).length === 0 || disabledUI} /></Tooltip>
                </div>
            </Header>
            <Layout hasSider>
                <Sider width={60} className="unified-tool-sider" theme="light">
                    <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: '16px' }}>
                        <Tooltip title={t.selectTool} placement="right"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
                        <Tooltip title={t.magnifier} placement="right"><Button onClick={() => setIsMagnifierVisible(p => !p)} type={isMagnifierVisible ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faSearchPlus} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
                        <Tooltip title={t.drawingMode} placement="right"><Button onClick={() => setActiveTool('draw')} type={activeTool === 'draw' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faPen} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
                        <Tooltip title={t.coloringMode} placement="right"><Button onClick={() => setActiveTool('stain')} type={activeTool === 'stain' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
                        <Tooltip title={t.deleteBox} placement="right"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={!hasWorkspace || disabledUI} /></Tooltip>
                        <Tooltip title={t.regionDelete} placement="right"><Button onClick={() => setActiveTool('region-delete')} type={activeTool === 'region-delete' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faEraser} />} danger={activeTool === 'region-delete'} disabled={!hasWorkspace || disabledUI} /></Tooltip>
                        <Divider style={{ margin: '8px 0' }} />
                        <Tooltip title={t.aiAnnotation} placement="right"><Button onClick={handleAiAnnotation} type="text" className="tool-button" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!currentImageDetails || disabledUI} /></Tooltip>
                    </Space>
                </Sider>
                <Sider
                    width={isExplorerVisible ? explorerWidth : 0}
                    className="unified-explorer-sider"
                    theme="light"
                    collapsible
                    collapsed={!isExplorerVisible}
                    trigger={null}
                    collapsedWidth={0}
                >
                    <div className="file-explorer-container">
                        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                            <Title level={5} style={{ margin: 0 }} >{t.fileExplorer}</Title>
                            <Tooltip title={t.hideExplorer}>
                                <Button type="text" icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => setIsExplorerVisible(false)} />
                            </Tooltip>
                        </Flex>
                        <Input.Search
                            placeholder={t.searchFiles}
                            onChange={(e) => setFileSearchTerm(e.target.value)}
                            allowClear
                        />
                        <div className="file-list-container">
                            <List
                                size="small"
                                dataSource={imageKeys.filter(key => key.toLowerCase().includes(fileSearchTerm.toLowerCase()))}
                                renderItem={(item, index) => {
                                    const originalIndex = imageKeys.findIndex(key => key === item);
                                    return (
                                        <List.Item
                                            onClick={() => handleNavigateToIndex(originalIndex)}
                                            style={{
                                                cursor: 'pointer',
                                                backgroundColor: originalIndex === file_currentIndex ? 'var(--primary-color-light)' : 'transparent',
                                                padding: '4px 8px',
                                                borderRadius: '4px'
                                            }}
                                        >
                                            <Text ellipsis title={item}>
                                                {`[${originalIndex + 1}] ${item}`}
                                            </Text>
                                        </List.Item>
                                    );
                                }}
                                locale={{ emptyText: <Text type="secondary">{t.noFile}</Text> }}
                            />
                        </div>
                    </div>
                </Sider>
                <div className="resizer-horizontal" onMouseDown={() => setIsResizingExplorer(true)} style={{ display: isExplorerVisible ? 'flex' : 'none' }} />

                <Layout className="main-content-wrapper">
                    {!isExplorerVisible && (
                        <Tooltip title={t.showExplorer} placement="right">
                            <Button
                                className="show-explorer-handle"
                                icon={<FontAwesomeIcon icon={faChevronRight} />}
                                onClick={() => setIsExplorerVisible(true)}
                            />
                        </Tooltip>
                    )}
                    <Content className="canvas-content">
                        {isTransitioning && <div className="transition-overlay"><Spin size="large" /></div>}
                        <div className={`canvas-wrapper`}>
                            <canvas
                                ref={canvasRef}
                                onMouseDown={disabledUI ? undefined : handleMouseDown}
                                onMouseMove={disabledUI ? undefined : handleMouseMove}
                                onMouseUp={disabledUI ? undefined : handleMouseUp}
                                className={getCanvasCursor()}
                                onMouseEnter={() => setIsMouseOnCanvas(true)}
                                onMouseLeave={() => setIsMouseOnCanvas(false)}
                            />
                        </div>
                        {isMagnifierVisible && (
                            <div
                                style={{ position: 'fixed', top: magnifierPos.y, left: magnifierPos.x, width: MAGNIFIER_SIZE, height: MAGNIFIER_SIZE, border: '2px solid #4096ff', borderRadius: '50%', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', cursor: 'move', overflow: 'hidden' }}
                                onMouseDown={handleMagnifierMouseDown}
                            >
                                <canvas ref={magnifierCanvasRef} width={MAGNIFIER_SIZE} height={MAGNIFIER_SIZE} style={{ cursor: 'none' }} />
                            </div>
                        )}
                    </Content>
                    {!isInspectorVisible && (
                        <Tooltip title={t.showPanel} placement="left">
                            <Button
                                className="show-inspector-handle"
                                icon={<FontAwesomeIcon icon={faChevronLeft} />}
                                onClick={() => setIsInspectorVisible(true)}
                            />
                        </Tooltip>
                    )}
                </Layout>

                <div className="resizer-horizontal" onMouseDown={() => setIsResizingInspector(true)} style={{ display: isInspectorVisible ? 'flex' : 'none' }} />
                <Sider width={isInspectorVisible ? inspectorWidth : 0} className="unified-inspector-sider" theme="light" collapsible collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
                    <Tabs defaultActiveKey="annotation" className="inspector-tabs"
                          tabBarExtraContent={ <Tooltip title={t.hidePanel}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(false)} /></Tooltip> }
                    >
                        <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="annotation" disabled={disabledUI}>
                            <div className="tab-pane-content">
                                <div style={{ flexShrink: 0 }}>
                                    <Form layout="vertical">
                                        <Form.Item label={t.category} style={{ display: activeTool === 'draw' ? 'block' : 'none' }}>
                                            <Select value={currentClassIndex} onChange={setCurrentClassIndex} style={{ width: '100%' }}>{Object.entries(file_classMap).map(([idx, { color, label }]) => (<Option key={idx} value={parseInt(idx)}> <Space><div style={{ width: '16px', height: '16px', backgroundColor: color, borderRadius: '3px', border: '1px solid #ccc' }} />{`[${idx}] ${label}`}</Space> </Option>))}</Select>
                                        </Form.Item>
                                        <Form.Item label={t.chooseJsonName} style={{ display: activeTool === 'stain' ? 'block' : 'none' }}>
                                            <Select placeholder={t.chooseJsonName} value={selectedJsonName} onChange={setSelectedJsonName} style={{ width: '100%' }}>
                                                {Object.keys(file_kgComponentMap).map(name => <Option key={name} value={name}>{name}</Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item label={t.chooseJsonType} style={{ display: activeTool === 'stain' ? 'block' : 'none' }}>
                                            <Select placeholder={t.chooseJsonType} value={selectedJsonType} onChange={setSelectedJsonType} style={{ width: '100%' }}>
                                                {file_kgTypeMap.map(type => <Option key={type} value={type}>{type}</Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item label={t.regionDeleteMode} style={{ marginBottom: 8, display: activeTool === 'region-delete' ? 'block' : 'none' }}>
                                            <Radio.Group onChange={(e: RadioChangeEvent) => setRegionDeleteMode(e.target.value)} value={regionDeleteMode}>
                                                <Radio.Button value="contain">{t.fullyContained}</Radio.Button>
                                                <Radio.Button value="intersect">{t.intersecting}</Radio.Button>
                                            </Radio.Group>
                                        </Form.Item>
                                    </Form>
                                    <Divider />
                                    <Title level={5} style={{ marginBottom: 8 }}>{t.annotations}</Title>
                                </div>
                                {parsedYoloData.length > 0 ? (
                                    <div className="annotation-collapse-container">
                                        <Collapse accordion activeKey={selectedBoxName || undefined} onChange={(key) => { const newKey = Array.isArray(key) ? key[0] : (typeof key === 'string' ? key : null); setSelectedBoxName(newKey); setIsCurrentlyEditingId(null); }} ghost>
                                            {parsedYoloData.map((item) => (
                                                <Panel
                                                    key={item.name}
                                                    header={
                                                        <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                                                            <Space>
                                                                <div className="color-indicator" style={{ backgroundColor: file_classMap[item.classIdx]?.color || '#808080' }} />
                                                                <Text className="category-name-text" title={item.name} ellipsis>{item.name}</Text>
                                                            </Space>
                                                            <Tooltip title={t.deleteAnnotationTooltip}>
                                                                <Button icon={<FontAwesomeIcon icon={faTrash} />} type="text" danger size="small" onClick={(e) => { e.stopPropagation(); handleDeleteAnnotationByName(item.name); }} />
                                                            </Tooltip>
                                                        </Flex>
                                                    }
                                                    className="annotation-panel-item"
                                                >
                                                    <Descriptions bordered size="small" column={1} className="annotation-details">
                                                        <Descriptions.Item label={t.category}>{file_classMap[item.classIdx]?.label || 'N/A'}</Descriptions.Item>
                                                        <Descriptions.Item label="Center X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.x} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 2, v)} /> : item.x.toFixed(4)}</Descriptions.Item>
                                                        <Descriptions.Item label="Center Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.y} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 3, v)} /> : item.y.toFixed(4)}</Descriptions.Item>
                                                        <Descriptions.Item label="Width">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.w} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 4, v)} /> : item.w.toFixed(4)}</Descriptions.Item>
                                                        <Descriptions.Item label="Height">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" min={0} max={1} step={0.001} controls={false} value={item.h} onFocus={() => handleEditFocus(item.name)} onChange={(v) => handleAnnotationPropertyUpdate(item.name, 5, v)} /> : item.h.toFixed(4)}</Descriptions.Item>
                                                    </Descriptions>
                                                </Panel>
                                            ))}
                                        </Collapse>
                                    </div>
                                ) : <Text type="secondary" style={{ textAlign: 'center', display: 'block', paddingTop: '20px' }}>{t.noAnnotations}</Text>}
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.rawData} placement="bottom"><FontAwesomeIcon icon={faDatabase} /></Tooltip>} key="data" disabled={disabledUI}>
                            <div className="tab-pane-content">
                                <Tabs defaultActiveKey="yolo" type="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <TabPane tab="YOLO Data (.txt)" key="yolo" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                        <textarea value={currentYoloContent || ""} className="data-content-textarea" readOnly placeholder="YOLO format data (e.g., box coordinates and class IDs) will appear here." />
                                    </TabPane>
                                    <TabPane tab="Annotation Data (.json)" key="json" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                        <textarea value={currentJsonContent || "{}"} className="data-content-textarea" readOnly placeholder="JSON annotation data will appear here." />
                                    </TabPane>
                                    <TabPane tab="Netlist (.scs)" key="scs" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                        <textarea value={netlistScsContent || ""} className="data-content-textarea" readOnly placeholder="Netlist (SCS format) will be shown here after processing." />
                                    </TabPane>
                                    <TabPane tab="Netlist (.cdl)" key="cdl" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                        <textarea value={netlistCdlContent || ""} className="data-content-textarea" readOnly placeholder="Netlist (CDL format) will be shown here after processing." />
                                    </TabPane>
                                </Tabs>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faBook} /></Tooltip>} key="management" disabled={disabledUI}>
                            <div className="tab-pane-content">
                                <Tabs defaultActiveKey="class" type="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <TabPane tab={<span><FontAwesomeIcon icon={faTags} style={{marginRight: 8}}/>{t.classManagement}</span>} key="class">
                                        <Flex justify="space-between" align="center"><Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title><Space.Compact><Tooltip title={t.importClasses}><Button icon={<FontAwesomeIcon icon={faFileImport} />} onClick={() => classImportRef.current?.click()} /></Tooltip><Tooltip title={t.exportClasses}><Button icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportClasses} /></Tooltip></Space.Compact></Flex>
                                        <input type="file" ref={classImportRef} onChange={handleImportClasses} style={{ display: 'none' }} accept=".txt" />
                                        <div className="class-list-container" style={{ marginTop: 16 }}>
                                            <List size="small" dataSource={Object.entries(file_classMap)} renderItem={([idx, { label, color }]) => { const index = parseInt(idx); return (<List.Item><div className="class-management-item"><Input type="color" value={color} className="color-picker-input" onChange={e => handleUpdateClass(index, 'color', e.target.value)} /><Input defaultValue={label} onBlur={e => handleUpdateClass(index, 'label', e.target.value)} placeholder={t.className} /><Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteClass(index)} danger /></Tooltip></div></List.Item>); }} />
                                        </div>
                                        <Button onClick={handleAddClass} icon={<FontAwesomeIcon icon={faPlus} />} block style={{ marginTop: 8 }}>{t.addClass}</Button>
                                    </TabPane>
                                    <TabPane tab={<span><FontAwesomeIcon icon={faCubes} style={{marginRight: 8}}/>{t.componentManagement}</span>} key="component">
                                        <Title level={5} style={{ margin: 0 }}>{t.componentManagement}</Title>
                                        <div className="class-list-container" style={{ marginTop: 16 }}>
                                            <List size="small" dataSource={Object.entries(file_kgComponentMap)} renderItem={([name, { color }]) => (<List.Item><div className="class-management-item"><Input type="color" value={color} className="color-picker-input" onChange={e => handleUpdateKgComponent(name, 'color', e.target.value)} /><Input defaultValue={name} onBlur={e => handleUpdateKgComponent(name, 'name', e.target.value)} placeholder={t.componentName} /><Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteKgComponent(name)} danger /></Tooltip></div></List.Item>)} />
                                        </div>
                                        <Space.Compact style={{ width: '100%', marginTop: 8 }}><Input placeholder={t.newComponentName} value={newComponentName} onChange={e => setNewComponentName(e.target.value)} onPressEnter={handleAddComponent} /><Button type="primary" icon={<FontAwesomeIcon icon={faPlus} />} onClick={handleAddComponent}>{t.addComponent}</Button></Space.Compact>
                                    </TabPane>
                                    <TabPane tab={<span><FontAwesomeIcon icon={faFolderTree} style={{marginRight: 8}}/>{t.typeManagement}</span>} key="type">
                                        <Title level={5} style={{ margin: 0 }}>{t.typeManagement}</Title>
                                        <div className="class-list-container" style={{ marginTop: 16 }}>
                                            <List size="small" dataSource={file_kgTypeMap} renderItem={(typeName) => (<List.Item><div className="class-management-item"><Input defaultValue={typeName} onBlur={e => handleUpdateKgType(typeName, e.target.value)} placeholder={t.typeName} /><Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteKgType(typeName)} danger /></Tooltip></div></List.Item>)} />
                                        </div>
                                        <Space.Compact style={{ width: '100%', marginTop: 8 }}><Input placeholder={t.newTypeName} value={newComponentType} onChange={e => setNewComponentType(e.target.value)} onPressEnter={handleAddComponentType} /><Button type="primary" icon={<FontAwesomeIcon icon={faPlus} />} onClick={handleAddComponentType}>{t.addType}</Button></Space.Compact>
                                    </TabPane>
                                </Tabs>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.knowledgeGraph} placement="bottom"><FontAwesomeIcon icon={faProjectDiagram} /></Tooltip>} key="kg" disabled={disabledUI}>
                            <div className="tab-pane-content">
                                <Tabs defaultActiveKey="node" type="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <TabPane tab={<span><FontAwesomeIcon icon={faFolderTree} style={{ marginRight: 8 }} />{t.nodeOperations}</span>} key="node" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                        <Form form={nodeForm} layout="vertical" name="node_form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                            <Form.Item name="name" label={t.nodeName} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                                <Input placeholder="e.g., ylb_voltage-mode_bandgap_reference_01" />
                                            </Form.Item>
                                            <Form.Item label={t.nodeProperties} style={{ marginBottom: 0 }}>
                                                {renderPropertiesEditor()}
                                            </Form.Item>
                                            <Space direction="vertical" style={{ width: '100%', marginTop: 'auto' }}>
                                                <Button type="primary" icon={<FontAwesomeIcon icon={faPlus} />} onClick={() => handleNodeAction('create')} block>{t.createNode}</Button>
                                                <Button icon={<FontAwesomeIcon icon={faEdit} />} onClick={() => handleNodeAction('update')} block>{t.updateNode}</Button>
                                                <Button icon={<FontAwesomeIcon icon={faSearch} />} onClick={() => handleNodeAction('find')} block>{t.findNode}</Button>
                                                <Button danger icon={<FontAwesomeIcon icon={faTrash} />} onClick={() => handleNodeAction('delete')} block>{t.deleteNode}</Button>
                                            </Space>
                                        </Form>
                                    </TabPane>
                                    <TabPane tab={<span><FontAwesomeIcon icon={faLink} style={{ marginRight: 8 }} />{t.relationshipOperations}</span>} key="relationship" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                        <Form form={relationshipForm} layout="vertical" name="relationship_form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }} initialValues={{ properties: [{ key: 'fromNode', value: '' }, { key: 'toNode', value: '' }] }}>
                                            <Form.Item name="name" label={t.relationshipName} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                                                <Input placeholder="e.g., PSR" />
                                            </Form.Item>
                                            <Form.Item label={t.relationshipProperties} help={t.fromNodeHelp} style={{ marginBottom: 0 }}>
                                                {renderPropertiesEditor()}
                                            </Form.Item>
                                            <Space direction="vertical" style={{ width: '100%', marginTop: 'auto' }}>
                                                <Button type="primary" icon={<FontAwesomeIcon icon={faPlus} />} onClick={() => handleRelationshipAction('create')} block>{t.createRelationship}</Button>
                                                <Button icon={<FontAwesomeIcon icon={faEdit} />} onClick={() => handleRelationshipAction('update')} block>{t.updateRelationship}</Button>
                                                <Button icon={<FontAwesomeIcon icon={faSearch} />} onClick={() => handleRelationshipAction('find')} block>{t.findRelationship}</Button>
                                                <Button danger icon={<FontAwesomeIcon icon={faTrash} />} onClick={() => handleRelationshipAction('delete')} block>{t.deleteRelationship}</Button>
                                            </Space>
                                        </Form>
                                    </TabPane>
                                </Tabs>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.annotationHistory} placement="bottom"><FontAwesomeIcon icon={faHistory} /></Tooltip>} key="history" disabled={disabledUI}>
                            <div className="tab-pane-content" style={{ padding: '8px', gap: '8px' }}>
                                <div className="history-list-container">
                                    <List
                                        size="small"
                                        dataSource={file_operationHistory[file_currentIndex] || []}
                                        renderItem={(op, index) => (
                                            <List.Item style={{ padding: '4px 8px' }}>
                                                <Text ellipsis title={getOperationDescription(op)}>{`${index + 1}. ${getOperationDescription(op)}`}</Text>
                                            </List.Item>
                                        )}
                                        locale={{ emptyText: <Text type="secondary">{t.noHistory}</Text> }}
                                    />
                                </div>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCogs} /></Tooltip>} key="settings" disabled={disabledUI}>
                            <div className="tab-pane-content">
                                <Title level={5}>{t.settings}</Title>
                                <p>此页面暂无特定设置。</p>
                            </div>
                        </TabPane>
                    </Tabs>
                </Sider>
            </Layout>
        </Layout>
    );
};

export default FileOperate;
// END OF FILE: src/pages/FileOperate/index.tsx
