// START OF FILE src/pages/FileOperate/index.tsx
import FileExplorer from "@/components/FileExplorer";
import type { FileNode } from "@/models/fileTree";
import {
    faCogs,
    faDatabase, faEraser,
    faFileExport,
    faFileImport,
    faList, faMinusCircle, faMousePointer,
    faPaintBrush,
    faPen,
    faPlus,
    faRedo,
    faRobot,
    faSave,
    faSearchPlus,
    faTags,
    faTrash,
    faUndo
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
    Tabs,
    Tooltip,
    Typography,
    message,
} from 'antd';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import React, { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiComponent, ApiResponse, ClassInfo, Operation } from './constants';
import { jsonNameColorMap, translations } from './constants';
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
        buildingBlocks: { [key: string]: string[] };
        constants: { [key: string]: string[] };
    };
    global: { [key: string]: any };
}

type FullApiResponse = ApiResponse;


const RESIZE_HANDLE_SIZE = 8;
const MAGNIFIER_SIZE = 150; // The size of the magnifier view
const MAGNIFIER_ZOOM = 3; // The zoom level

/**
 * @description Recursively searches for a file node by its path (key) in the file tree.
 * @param {string} key The path of the file to find.
 * @param {any} node The current node to search within.
 * @returns {FileNode | null} The found file node or null.
 */
const findFileNodeByKey = (key: string, node: any): FileNode | null => {
    if (node.key === key && node.isLeaf) {
        return node;
    }
    if (!node.isLeaf) {
        for (const child of node.children) {
            const found = findFileNodeByKey(key, child);
            if (found) {
                return found;
            }
        }
    }
    return null;
};

/**
 * @description Converts a standard YOLO format (class_idx x y w h) to the internal format (name class_idx x y w h).
 *              This is a pure utility function.
 * @param {string} standardYoloContent - The content in standard YOLO format.
 * @param {{ [key: number]: ClassInfo }} classMap - The map of class indices to class info.
 * @returns {string} The content in the internal YOLO format.
 */
export const convertStandardYoloToInternal = (standardYoloContent: string, classMap: { [key: number]: ClassInfo }): string => {
    const lines = standardYoloContent.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return '';
    const firstLineParts = lines[0].split(' ');
    // Check if the first line looks like standard YOLO (starts with a number, has 5 parts)
    // If not, assume it's already in the internal format.
    if (firstLineParts.length !== 5 || isNaN(parseFloat(firstLineParts[0]))) {
        return standardYoloContent;
    }
    const nameCounters: { [key: string]: number } = {};
    const internalYoloLines = lines.map(line => {
        const parts = line.split(' ');
        if (parts.length !== 5) return line; // a malformed line, pass through
        const classIndex = parseInt(parts[0], 10);
        if (isNaN(classIndex)) return line; // malformed line
        const classLabel = classMap[classIndex]?.label || `class_${classIndex}`;
        const counter = nameCounters[classLabel] || 0;
        nameCounters[classLabel] = counter + 1;
        const uniqueName = `${classLabel}_${counter}`;
        return `${uniqueName} ${line}`;
    });
    return internalYoloLines.join('\n');
};


const generateRandomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

export const parseJsonContent = (jsonContent: string | null): JsonData => {
    try {
        if (!jsonContent || jsonContent.trim() === "" || jsonContent.trim() === "{}") {
            return { local: { buildingBlocks: {}, constants: {} }, global: {} };
        }
        const parsed = JSON.parse(jsonContent);
        // This check is important because AI response will not have 'local'
        if (!parsed.local && !parsed.global && (parsed.cpnts || parsed.segments)) {
            // It looks like an AI response, not the internal format.
            // For now, to avoid breaking the 'stain' tool, we treat it as empty for the internal structure.
            return { local: { buildingBlocks: {}, constants: {} }, global: {} };
        }
        parsed.local = parsed.local || { buildingBlocks: {}, constants: {} };
        parsed.local.buildingBlocks = parsed.local.buildingBlocks || {};
        parsed.local.constants = parsed.local.constants || {};
        parsed.global = parsed.global || {};
        return parsed;
    } catch (e) {
        console.error("JSON parsing for staining tool failed, returning default object.", e);
        return { local: { buildingBlocks: {}, constants: {} }, global: {} };
    }
};

export const stringifyJsonContent = (jsonObj: JsonData | null): string => {
    if (!jsonObj) return "{}";
    return JSON.stringify(jsonObj, null, 2);
};


const convertCpntsToYolo = (cpnts: ApiComponent[], imageWidth: number, imageHeight: number, classMap: { [key: number]: ClassInfo }): string => {
    if (!Array.isArray(cpnts) || imageWidth === 0 || imageHeight === 0) {
        return "";
    }
    const yoloLines: string[] = [];
    const existingNames: { [key: string]: number } = {};
    cpnts.forEach(cpnt => {
        if (typeof cpnt.t === 'undefined' || typeof cpnt.b === 'undefined' || typeof cpnt.l === 'undefined' || typeof cpnt.r === 'undefined' || typeof cpnt.type === 'undefined') {
            console.warn('Skipping invalid cpnt object:', cpnt);
            return;
        }
        const { t: top, b: bottom, l: left, r: right, type } = cpnt;
        let classIndex = -1;
        let classLabel = '';
        for (const [idx, info] of Object.entries(classMap)) {
            if (info.label === type) {
                classIndex = parseInt(idx, 10);
                classLabel = info.label;
                break;
            }
        }
        if (classIndex === -1) {
            console.warn(`Class type "${type}" not found in classMap.`);
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
        fileTree,
        file_currentFilePath, setFile_currentFilePath, // Bedrock V4 Change
        file_classMap: classMap, setFile_classMap: setClassMap,
        file_yoloFileContents, setFile_yoloFileContents,
        file_jsonFileContents, setFile_jsonFileContents,
        file_operationHistory: operationHistory, setFile_operationHistory: setOperationHistory,
        file_redoHistory: redoHistory, setFile_redoHistory: setRedoHistory,
        modifiedFiles,
        markFileAsModified,
    } = useModel('annotationStore');

    const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
    const t = translations[currentLang];

    // Local state for the current file's content, derived from global store
    const [currentYoloContent, setCurrentYoloContent] = useState<string | null>(null);
    const [currentJsonContent, setCurrentJsonContent] = useState<string | null>(null);
    const [currentPng, setCurrentPng] = useState<File | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [currentClassIndex, setCurrentClassIndex] = useState<number>(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [mouseDownCoords, setMouseDownCoords] = useState({ x: 0, y: 0 });
    const [canvasImageData, setCanvasImageData] = useState<ImageData | null>(null);
    const [selectedJsonName, setSelectedJsonName] = useState<string | null>(null);
    const [selectedJsonType, setSelectedJsonType] = useState<'buildingBlocks' | 'constants' | null>(null);
    const [activeTool, setActiveTool] = useState<ActiveTool>('select');
    const [redrawTrigger, setRedrawTrigger] = useState(0);
    const [leftSiderWidth, setLeftSiderWidth] = useState<number>(250);
    const [rightSiderWidth, setRightSiderWidth] = useState<number>(350);
    const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
    const [isResizingRight, setIsResizingRight] = useState<boolean>(false);

    const [isAiAnnotating, setIsAiAnnotating] = useState(false);
    const classImportRef = useRef<HTMLInputElement>(null);

    const [draggingState, setDraggingState] = useState<DraggingState>(null);
    const [regionSelectBox, setRegionSelectBox] = useState<RegionSelectBox>(null);
    const [regionDeleteMode, setRegionDeleteMode] = useState<RegionDeleteMode>('contain');
    const [selectedBoxName, setSelectedBoxName] = useState<string | null>(null);
    const [isCurrentlyEditingId, setIsCurrentlyEditingId] = useState<string | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null);

    // Magnifier State
    const [isMagnifierVisible, setIsMagnifierVisible] = useState(false);
    const [magnifierPos, setMagnifierPos] = useState<Point>({ x: 900, y: 200 });
    const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);
    const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });

    const [netlistScsContent, setNetlistScsContent] = useState<string | null>(null);
    const [netlistCdlContent, setNetlistCdlContent] = useState<string | null>(null);

    // Bedrock Change V4: Centralized state saving logic
    const saveCurrentState = useCallback(() => {
        if (!file_currentFilePath) return;

        setFile_yoloFileContents(prev => ({ ...prev, [file_currentFilePath]: currentYoloContent || '' }));

        let jsonToSave = currentJsonContent;
        if (netlistScsContent || netlistCdlContent) {
            try {
                const mainPart = JSON.parse(currentJsonContent || '{}');
                jsonToSave = JSON.stringify({ ...mainPart, netlist_scs: netlistScsContent, netlist_cdl: netlistCdlContent }, null, 2);
            } catch (e) { /* use as is if parsing fails */ }
        }
        setFile_jsonFileContents(prev => ({ ...prev, [file_currentFilePath]: jsonToSave || '{}' }));
    }, [file_currentFilePath, currentYoloContent, currentJsonContent, netlistScsContent, netlistCdlContent, setFile_yoloFileContents, setFile_jsonFileContents]);

    // Bedrock Change V4: Effect for auto-saving on component unmount (page switch)
    const saveFuncRef = useRef(saveCurrentState);
    saveFuncRef.current = saveCurrentState;

    useEffect(() => {
        return () => {
            saveFuncRef.current();
        };
    }, []);

    useEffect(() => {
        setCurrentLang(initialState?.language || 'zh');
    }, [initialState?.language]);

    // This effect now triggers when the page-specific file path changes
    useEffect(() => {
        if (file_currentFilePath && fileTree) {
            const node = findFileNodeByKey(file_currentFilePath, fileTree);
            if (node) {
                setCurrentPng(node.file);
                const yoloContent = file_yoloFileContents[file_currentFilePath] || '';
                const jsonText = file_jsonFileContents[file_currentFilePath] || '{}';

                setCurrentYoloContent(yoloContent);
                try {
                    const fullData: FullApiResponse = JSON.parse(jsonText);
                    if (typeof fullData === 'object' && fullData !== null) {
                        setNetlistScsContent(fullData.netlist_scs || null);
                        setNetlistCdlContent(fullData.netlist_cdl || null);
                        const displayData = { ...fullData };
                        delete displayData.netlist_scs;
                        delete displayData.netlist_cdl;
                        setCurrentJsonContent(JSON.stringify(displayData, null, 2));
                    } else {
                        setCurrentJsonContent(jsonText);
                        setNetlistScsContent(null);
                        setNetlistCdlContent(null);
                    }
                } catch (e) {
                    setCurrentJsonContent(jsonText);
                    setNetlistScsContent(null);
                    setNetlistCdlContent(null);
                }
            }
        } else {
            setCurrentPng(null);
            setCurrentYoloContent('');
            setCurrentJsonContent('{}');
            setNetlistScsContent(null);
            setNetlistCdlContent(null);
        }
        setSelectedBoxName(null);
    }, [file_currentFilePath, fileTree, file_yoloFileContents, file_jsonFileContents]);


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

        if (currentPng) {
            const img = new Image();
            img.onload = () => {
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
                    const color = classMap[classIdx]?.color || '#808080';
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
                    Object.values(parsedStainJson.local).forEach(nameMap => {
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
    }, [currentPng, parsedYoloData, currentJsonContent, classMap, t.noImages, selectedBoxName, regionSelectBox]);

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

        // Draw crosshair
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

    useEffect(() => { redrawCanvas(); }, [redrawTrigger, redrawCanvas, currentYoloContent]);

    useEffect(() => {
        const handleResize = () => setRedrawTrigger(p => p + 1);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Sider resize logic
    useEffect(() => {
        const handleMouseMove = (e: globalThis.MouseEvent) => {
            if (isResizingLeft) {
                const newWidth = e.clientX;
                if (newWidth > 150 && newWidth < 600) setLeftSiderWidth(newWidth);
            }
            if (isResizingRight) {
                const newWidth = window.innerWidth - e.clientX;
                if (newWidth > 200 && newWidth < 800) setRightSiderWidth(newWidth);
            }
        };
        const handleMouseUp = () => {
            setIsResizingLeft(false);
            setIsResizingRight(false);
        };

        if (isResizingLeft || isResizingRight) {
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingLeft, isResizingRight]);


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

    const handleFileSelect = (filePath: string) => {
        if (filePath === file_currentFilePath) {
            return;
        }
        saveCurrentState();
        setFile_currentFilePath(filePath);
    };


    const handleDeleteAnnotationByName = useCallback((boxNameToDelete: string) => {
        if (!boxNameToDelete || !file_currentFilePath) return;

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
                const type = typeKey as keyof typeof parsedJson.local;
                Object.keys(parsedJson.local[type]).forEach(nameKey => {
                    parsedJson.local[type][nameKey] = parsedJson.local[type][nameKey].filter(
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
            setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
            setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
        }

        if (selectedBoxName === boxNameToDelete) {
            setSelectedBoxName(null);
        }

        markFileAsModified(file_currentFilePath);
        message.success(`标注 '${boxNameToDelete}' 已删除`);
        setRedrawTrigger(p => p + 1);
    }, [currentYoloContent, currentJsonContent, file_currentFilePath, selectedBoxName, setOperationHistory, setRedoHistory, setCurrentYoloContent, setCurrentJsonContent, setSelectedBoxName, markFileAsModified]);


    const handleCanvasAction = (e: MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current; if (!canvas || !currentYoloContent || !file_currentFilePath) return;
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
                    setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
                    setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
                    markFileAsModified(file_currentFilePath);
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
        if (e.button !== 0 || !file_currentFilePath) return;

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
                        setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
                        setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
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
                setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
                setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
            } else {
                setDraggingState(null);
            }
        }
    };

    const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current; if (!canvas) return;
        const currentPos = getScaledCoords(e);
        setCanvasMousePos(currentPos); // update canvas mouse pos for magnifier

        if (isDrawing && activeTool === 'draw') {
            const ctx = canvas.getContext('2d');
            if (ctx && canvasImageData) {
                ctx.putImageData(canvasImageData, 0, 0); ctx.beginPath();
                ctx.strokeStyle = classMap[currentClassIndex]?.color || '#262626';
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
        if (e.button !== 0 || !file_currentFilePath) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const upPos = getScaledCoords(e);

        if (isDrawing && activeTool === 'draw') {
            setIsDrawing(false);
            const x1 = Math.min(mouseDownCoords.x, upPos.x); const y1 = Math.min(mouseDownCoords.y, upPos.y);
            const width = Math.abs(upPos.x - mouseDownCoords.x); const height = Math.abs(upPos.y - mouseDownCoords.y);

            if (width > 2 && height > 2) {
                const classLabel = classMap[currentClassIndex]?.label || `class_${currentClassIndex}`;
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
                setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
                setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
                markFileAsModified(file_currentFilePath);
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
                        const type = typeKey as keyof typeof parsedJson.local;
                        Object.keys(parsedJson.local[type]).forEach(nameKey => {
                            parsedJson.local[type][nameKey] = parsedJson.local[type][nameKey].filter(
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
                setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
                setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
                markFileAsModified(file_currentFilePath);
                message.success(`删除了 ${boxNamesToDelete.length} 个标注。`);
            }
        }
        if (draggingState) { // Any drag operation should mark file as modified
            markFileAsModified(file_currentFilePath);
        }
        setDraggingState(null);
        setRegionSelectBox(null);
        setRedrawTrigger(p => p + 1);
    };

    const addUndoRecord = useCallback(() => {
        if (!file_currentFilePath) return;
        const newOp: Operation = { type: 'move', previousYoloContent: currentYoloContent };
        setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
        setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));
        markFileAsModified(file_currentFilePath);
    }, [currentYoloContent, file_currentFilePath, setOperationHistory, setRedoHistory, markFileAsModified]);

    const handleEditFocus = useCallback((boxName: string) => {
        if (isCurrentlyEditingId !== boxName) {
            addUndoRecord();
            setIsCurrentlyEditingId(boxName);
        }
    }, [isCurrentlyEditingId, addUndoRecord]);

    const handleAnnotationPropertyUpdate = useCallback((boxName: string, propIndex: number, value: number | null) => {
        if (value === null || !file_currentFilePath) return;
        const newYoloContent = (currentYoloContent || '').split('\n').map(line => {
            const parts = line.split(' ');
            if (parts[0] === boxName) {
                parts[propIndex + 1] = (value as number).toFixed(6);
                return parts.join(' ');
            }
            return line;
        }).join('\n');
        setCurrentYoloContent(newYoloContent);
        markFileAsModified(file_currentFilePath);
    }, [currentYoloContent, setCurrentYoloContent, file_currentFilePath, markFileAsModified]);

    const handleUndo = () => {
        if (!file_currentFilePath) return;
        const currentImageHistory = operationHistory[file_currentFilePath] || [];
        if (currentImageHistory.length === 0) { message.info(t.noUndoOperations); return; }
        const lastOperation = currentImageHistory[currentImageHistory.length - 1];
        let redoOp: Operation;
        switch (lastOperation.type) { case 'draw': case 'ai_annotate': case 'move': redoOp = { ...lastOperation, previousYoloContent: currentYoloContent }; break; case 'stain': case 'json_change': redoOp = { ...lastOperation, previousJsonContent: currentJsonContent }; break; case 'delete': redoOp = { ...lastOperation, previousYoloContent: currentYoloContent, previousJsonContent: currentJsonContent }; break; default: return; }
        setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [redoOp, ...(prev[file_currentFilePath] || [])] }));
        setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: currentImageHistory.slice(0, -1) }));
        if ('previousYoloContent' in lastOperation) { setCurrentYoloContent(lastOperation.previousYoloContent); }
        if ('previousJsonContent' in lastOperation) { setCurrentJsonContent(lastOperation.previousJsonContent); }
        markFileAsModified(file_currentFilePath);
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful);
    };
    const handleRedo = () => {
        if (!file_currentFilePath) return;
        const currentImageRedoHistory = redoHistory[file_currentFilePath] || [];
        if (currentImageRedoHistory.length === 0) { message.info(t.noRedoOperations); return; }
        const operationToRedo = currentImageRedoHistory[0];
        let undoOp: Operation;
        switch (operationToRedo.type) { case 'draw': case 'ai_annotate': case 'move': undoOp = { ...operationToRedo, previousYoloContent: currentYoloContent }; break; case 'stain': case 'json_change': undoOp = { ...operationToRedo, previousJsonContent: currentJsonContent }; break; case 'delete': undoOp = { ...operationToRedo, previousYoloContent: currentYoloContent, previousJsonContent: currentJsonContent }; break; default: return; }
        setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), undoOp] }));
        setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: currentImageRedoHistory.slice(1) }));
        if ('previousYoloContent' in operationToRedo) { setCurrentYoloContent(operationToRedo.previousYoloContent); }
        if ('previousJsonContent' in operationToRedo) { setCurrentJsonContent(operationToRedo.previousJsonContent); }
        markFileAsModified(file_currentFilePath);
        setRedrawTrigger(p => p + 1); message.success(t.operationSuccessful);
    };

    const handleSaveCurrent = () => {
        if (!file_currentFilePath) {
            message.warning(t.noFile);
            return;
        }
        saveCurrentState();
        markFileAsModified(file_currentFilePath);
        message.success(`${t.save} ${t.operationSuccessful}`);
    };

    const handleSaveAllToZip = async () => {
        if (!fileTree) {
            message.warning(t.noFile);
            return;
        }
        message.loading({ content: "正在准备数据并打包...", key: "exporting", duration: 0 });

        saveCurrentState();

        try {
            const zip = new JSZip();

            const allYoloContents = { ...file_yoloFileContents };
            if (file_currentFilePath) allYoloContents[file_currentFilePath] = currentYoloContent || '';

            const allJsonContents = { ...file_jsonFileContents };
            if (file_currentFilePath) {
                let jsonToSave = currentJsonContent;
                if (netlistScsContent || netlistCdlContent) {
                    try {
                        const mainPart = JSON.parse(currentJsonContent || '{}');
                        jsonToSave = JSON.stringify({ ...mainPart, netlist_scs: netlistScsContent, netlist_cdl: netlistCdlContent }, null, 2);
                    } catch (e) { /* use as is */ }
                }
                allJsonContents[file_currentFilePath] = jsonToSave || '{}';
            }


            const addFolderToZip = (node: any, currentZipFolder: JSZip) => {
                if (!node.isLeaf) { // It's a directory
                    const folder = currentZipFolder.folder(node.title);
                    if (folder) {
                        node.children.forEach((child: any) => addFolderToZip(child, folder));
                    }
                } else { // It's a file
                    const fileNode = node as FileNode;
                    currentZipFolder.file(fileNode.title, fileNode.file);

                    const yoloContent = allYoloContents[fileNode.key] || "";
                    const jsonContent = allJsonContents[fileNode.key] || "{}";

                    const baseName = fileNode.title.substring(0, fileNode.title.lastIndexOf('.'));

                    const standardYoloContent = (yoloContent).split('\n').map(line => {
                        if (!line.trim()) return '';
                        const parts = line.split(' ');
                        return parts.length >= 6 ? parts.slice(1).join(' ') : (parts.length === 5 ? line : '');
                    }).filter(Boolean).join('\n');

                    currentZipFolder.file(`${baseName}.txt`, standardYoloContent);
                    currentZipFolder.file(`${baseName}.json`, jsonContent);
                }
            };

            addFolderToZip(fileTree, zip);

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'fileoperate_annotations.zip');
            message.success({ content: "所有文件已打包下载", key: "exporting", duration: 2 });
        } catch (err: any) {
            message.error({ content: `导出失败: ${err.message}`, key: "exporting", duration: 2 });
        }
    };

    const handleAiAnnotation = async () => {
        if (!currentPng || !canvasRef.current || !file_currentFilePath) { message.warning(t.noFile); return; }

        setIsAiAnnotating(true);
        message.loading({ content: t.aiAnnotating, key: 'ai-annotation', duration: 0 });

        try {
            const formData = new FormData();
            formData.append('file', currentPng, currentPng.name);

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
                } catch (e) {
                    errorDetail = errorText || errorDetail;
                }
                throw new Error(errorDetail);
            }

            const resultData: FullApiResponse = await response.json();

            if (!resultData || !resultData.cpnts || resultData.cpnts.length === 0) {
                message.info({ content: "AI 未返回任何有效标注。", key: 'ai-annotation', duration: 3 });
                setIsAiAnnotating(false);
                return;
            }

            const previousYolo = currentYoloContent;

            const { width, height } = canvasRef.current;

            const newLabels = [...new Set(resultData.cpnts.map(c => c.type))];
            const existingLabels = Object.values(classMap).map(c => c.label);
            const newlyDiscovered = newLabels.filter(l => !existingLabels.includes(l));

            let currentClassMap = classMap;
            if (newlyDiscovered.length > 0) {
                let newClassMap = { ...classMap };
                let lastIndex = Object.keys(classMap).length > 0 ? Math.max(...Object.keys(classMap).map(Number)) : -1;
                newlyDiscovered.forEach(label => {
                    lastIndex++;
                    newClassMap[lastIndex] = { label, color: generateRandomColor() };
                });
                setClassMap(newClassMap);
                currentClassMap = newClassMap;
            }

            const newYoloContent = convertCpntsToYolo(resultData.cpnts, width, height, currentClassMap);

            if (!newYoloContent) {
                message.info({ content: "AI 未返回可解析的标注。", key: 'ai-annotation', duration: 3 });
                setIsAiAnnotating(false);
                return;
            }

            const displayData: { [key: string]: any } = { ...resultData };
            delete displayData.netlist_scs;
            delete displayData.netlist_cdl;
            const displayJsonContent = JSON.stringify(displayData, null, 2);

            setCurrentYoloContent(newYoloContent);
            setCurrentJsonContent(displayJsonContent);
            setNetlistScsContent(resultData.netlist_scs || null);
            setNetlistCdlContent(resultData.netlist_cdl || null);

            const newOp: Operation = { type: 'ai_annotate', yoloData: (newYoloContent || '').split('\n'), previousYoloContent: previousYolo };
            setOperationHistory(prev => ({ ...prev, [file_currentFilePath]: [...(prev[file_currentFilePath] || []), newOp] }));
            setRedoHistory(prev => ({ ...prev, [file_currentFilePath]: [] }));

            markFileAsModified(file_currentFilePath);
            setRedrawTrigger(p => p + 1);
            message.success({ content: t.operationSuccessful, key: 'ai-annotation' });

        } catch (error: any) {
            console.error("AI Annotation failed:", error);
            message.error({ content: `${t.aiFailed}: ${error.message}`, key: 'ai-annotation', duration: 5 });
        } finally {
            setIsAiAnnotating(false);
        }
    };

    const handleAddClass = () => { const existingIndices = Object.keys(classMap).map(Number); const newIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0; setClassMap(prev => ({ ...prev, [newIndex]: { label: 'new_class', color: generateRandomColor() } })); };
    const handleUpdateClass = (index: number, field: 'label' | 'color', value: string) => { setClassMap(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } })); };
    const handleDeleteClass = (indexToDelete: number) => { const title = t.deleteClassConfirmTitle ? t.deleteClassConfirmTitle.replace('%s', `[${indexToDelete}] ${classMap[indexToDelete]?.label}`) : `确认删除类别 [${indexToDelete}] ${classMap[indexToDelete]?.label}?`; Modal.confirm({ title: title, content: t.deleteClassConfirmContent, okText: t.confirmDelete, cancelText: t.cancel, okType: 'danger', onOk: () => { const newClassMap = { ...classMap }; delete newClassMap[indexToDelete]; setClassMap(newClassMap); if (currentClassIndex === indexToDelete) { const firstKey = Object.keys(newClassMap)[0]; setCurrentClassIndex(firstKey ? parseInt(firstKey) : 0); } message.success(t.classDeleted.replace('%s', classMap[indexToDelete]?.label || '')); } }); };

    const handleExportClasses = () => {
        const exportObj: { [key: string]: string } = {};
        for (const key in classMap) {
            exportObj[key] = classMap[key].label;
        }
        const classText = `classes = ${JSON.stringify(exportObj, null, 4)}`;
        const blob = new Blob([classText], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, 'classes.txt');
    };

    const handleImportClasses = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            try {
                const jsonStringMatch = text.match(/=\s*({[\s\S]*})/);
                if (!jsonStringMatch || !jsonStringMatch[1]) {
                    throw new Error("Invalid format: Could not find object literal '{...}'.");
                }
                const jsonString = jsonStringMatch[1];
                const parsedObject = new Function(`return ${jsonString}`)();

                if (typeof parsedObject !== 'object' || parsedObject === null) {
                    throw new Error("Parsed content is not a valid object.");
                }

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

                if (!hasEntries) {
                    throw new Error("No valid class entries found in the file.");
                }

                setClassMap(newClassMap);
                setCurrentClassIndex(0);
                message.success(`成功导入 ${Object.keys(newClassMap).length} 个类别。`);

            } catch (error: any) {
                console.error("Failed to import classes:", error);
                message.error(`导入类别失败: ${error.message}`);
            }
        };
        reader.readAsText(file);
        if (event.target) event.target.value = '';
    };

    const isSelectedForEdit = (item: { name: string }) => activeTool === 'select' && item.name === selectedBoxName;

    const getCanvasCursor = () => {
        if (isMagnifierVisible) return 'none'; // Hide system cursor when magnifier is active
        switch (activeTool) {
            case 'delete': return 'delete-cursor';
            case 'draw': return 'draw-cursor';
            case 'region-delete': return 'draw-cursor'; // crosshair
            case 'select': return getCursorForHandle(hoveredHandle);
            default: return 'default';
        }
    }

    return (
        <Layout className="unified-layout">
            <Header className="unified-top-header">
                <div className="header-left-controls">
                    <Text className="current-file-text" title={currentPng?.name}>{currentPng ? `${t.currentFile}: ${currentPng.name}` : t.noImages}</Text>
                </div>
                <Space className="header-center-controls">
                    <Tooltip title={t.selectTool} placement="bottom"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={!currentPng} /></Tooltip>
                    <Tooltip title={t.magnifier} placement="bottom"><Button onClick={() => setIsMagnifierVisible(p => !p)} type={isMagnifierVisible ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faSearchPlus} />} disabled={!currentPng} /></Tooltip>
                    <Tooltip title={t.drawingMode} placement="bottom"><Button onClick={() => setActiveTool('draw')} type={activeTool === 'draw' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faPen} />} disabled={!currentPng} /></Tooltip>
                    <Tooltip title={t.coloringMode} placement="bottom"><Button onClick={() => setActiveTool('stain')} type={activeTool === 'stain' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={!currentPng} /></Tooltip>
                    <Tooltip title={t.deleteBox} placement="bottom"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={!currentPng} /></Tooltip>
                    <Tooltip title={t.regionDelete} placement="bottom"><Button onClick={() => setActiveTool('region-delete')} type={activeTool === 'region-delete' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faEraser} />} danger={activeTool === 'region-delete'} disabled={!currentPng} /></Tooltip>
                    <Divider type="vertical" />
                    <Tooltip title={t.aiAnnotation} placement="bottom"><Button onClick={handleAiAnnotation} type="text" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!currentPng || isAiAnnotating} /></Tooltip>
                </Space>
                <div className="header-right-controls">
                    <Tooltip title={t.undo}><Button onClick={handleUndo} icon={<FontAwesomeIcon icon={faUndo} />} disabled={(operationHistory[file_currentFilePath || ''] || []).length === 0} /></Tooltip>
                    <Tooltip title={t.redo}><Button onClick={handleRedo} icon={<FontAwesomeIcon icon={faRedo} />} disabled={(redoHistory[file_currentFilePath || ''] || []).length === 0} /></Tooltip>
                    <Button onClick={handleSaveCurrent} icon={<FontAwesomeIcon icon={faSave} />} disabled={!currentPng}>{t.save}</Button>
                    <Button onClick={handleSaveAllToZip} icon={<FontAwesomeIcon icon={faFileExport} />} type="primary" ghost disabled={!fileTree}>{t.saveAll}</Button>
                </div>
            </Header>
            <Layout hasSider>
                <Sider width={leftSiderWidth} className="file-explorer-sider" theme="light">
                    <FileExplorer onFileSelect={handleFileSelect} activeFilePath={file_currentFilePath} modifiedFiles={modifiedFiles} />
                </Sider>
                <div className="resizer-horizontal" onMouseDown={() => setIsResizingLeft(true)} />

                <Layout className="main-content-wrapper">
                    <Content className="canvas-content"
                        onMouseEnter={() => setIsMouseOnCanvas(true)}
                        onMouseLeave={() => setIsMouseOnCanvas(false)}
                    >
                        <div className={`canvas-wrapper`}>
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                className={getCanvasCursor()}
                            />
                        </div>
                        {isMagnifierVisible && (
                            <div
                                style={{
                                    position: 'fixed',
                                    top: magnifierPos.y,
                                    left: magnifierPos.x,
                                    width: MAGNIFIER_SIZE,
                                    height: MAGNIFIER_SIZE,
                                    border: '2px solid #4096ff',
                                    borderRadius: '50%',
                                    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
                                    cursor: 'move',
                                    overflow: 'hidden'
                                }}
                                onMouseDown={handleMagnifierMouseDown}
                            >
                                <canvas
                                    ref={magnifierCanvasRef}
                                    width={MAGNIFIER_SIZE}
                                    height={MAGNIFIER_SIZE}
                                    style={{ cursor: 'none' }}
                                />
                            </div>
                        )}
                    </Content>
                </Layout>
                <div className="resizer-horizontal" onMouseDown={() => setIsResizingRight(true)} />
                <Sider width={rightSiderWidth} className="unified-inspector-sider" theme="light" >
                    <Tabs defaultActiveKey="1" className="inspector-tabs">
                        <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="1">
                            <div className="tab-pane-content">
                                <div style={{ flexShrink: 0 }}>
                                    <Form layout="vertical">
                                        <Form.Item label={t.category} style={{ display: activeTool === 'draw' ? 'block' : 'none' }}>
                                            <Select value={currentClassIndex} onChange={setCurrentClassIndex} style={{ width: '100%' }}>{Object.entries(classMap).map(([idx, { color, label }]) => (<Option key={idx} value={parseInt(idx)}> <Space><div style={{ width: '16px', height: '16px', backgroundColor: color, borderRadius: '3px', border: '1px solid #ccc' }} />{`[${idx}] ${label}`}</Space> </Option>))}</Select>
                                        </Form.Item>
                                        <Form.Item label={t.chooseJsonName} style={{ display: activeTool === 'stain' ? 'block' : 'none' }}><Select placeholder={t.chooseJsonName} value={selectedJsonName} onChange={setSelectedJsonName} style={{ width: '100%' }}>{Object.keys(jsonNameColorMap).map(name => <Option key={name} value={name}>{name}</Option>)}</Select></Form.Item>
                                        <Form.Item label={t.chooseJsonType} style={{ display: activeTool === 'stain' ? 'block' : 'none' }}><Select placeholder={t.chooseJsonType} value={selectedJsonType} onChange={(v) => setSelectedJsonType(v as any)} style={{ width: '100%' }}><Option key="buildingBlocks" value="buildingBlocks">Building Blocks</Option><Option key="constants" value="constants">Constants</Option></Select></Form.Item>
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
                                                                <div className="color-indicator" style={{ backgroundColor: classMap[item.classIdx]?.color || '#808080' }} />
                                                                <Text className="category-name-text" title={item.name} ellipsis>{item.name}</Text>
                                                            </Space>
                                                            <Tooltip title={t.deleteAnnotationTooltip}>
                                                                <Button
                                                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                                                    type="text"
                                                                    danger
                                                                    size="small"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteAnnotationByName(item.name);
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        </Flex>
                                                    }
                                                    className="annotation-panel-item"
                                                >
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
                                    </div>
                                ) : <Text type="secondary" style={{ textAlign: 'center', display: 'block', paddingTop: '20px' }}>{t.noAnnotations}</Text>}
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.rawData} placement="bottom"><FontAwesomeIcon icon={faDatabase} /></Tooltip>} key="4">
                            <Tabs type="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <TabPane tab="YOLO (.txt)" key="yolo-data">
                                    <div className="data-view-item" style={{ height: '100%' }}>
                                        <textarea value={currentYoloContent || ""} className="data-content-textarea" readOnly />
                                    </div>
                                </TabPane>
                                <TabPane tab="Annotation Data (.json)" key="json-data">
                                    <div className="data-view-item" style={{ height: '100%' }}>
                                        <textarea value={currentJsonContent || "{}"} className="data-content-textarea" readOnly />
                                    </div>
                                </TabPane>
                                <TabPane tab="Netlist (.scs)" key="scs-data">
                                    <div className="data-view-item" style={{ height: '100%' }}>
                                        <textarea value={netlistScsContent || ""} className="data-content-textarea" readOnly placeholder="Netlist (SCS format) will be shown here after processing." />
                                    </div>
                                </TabPane>
                                <TabPane tab="Netlist (.cdl)" key="cdl-data">
                                    <div className="data-view-item" style={{ height: '100%' }}>
                                        <textarea value={netlistCdlContent || ""} className="data-content-textarea" readOnly placeholder="Netlist (CDL format) will be shown here after processing." />
                                    </div>
                                </TabPane>
                            </Tabs>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2">
                            <div className="tab-pane-content">
                                <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}><Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title><Space.Compact><Tooltip title={t.importClasses}><Button icon={<FontAwesomeIcon icon={faFileImport} />} onClick={() => classImportRef.current?.click()} /></Tooltip><Tooltip title={t.exportClasses}><Button icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportClasses} /></Tooltip></Space.Compact></Flex>
                                <input type="file" ref={classImportRef} onChange={handleImportClasses} style={{ display: 'none' }} accept=".txt" />
                                <div className="class-list-container">
                                    <List size="small" dataSource={Object.entries(classMap)} renderItem={([idx, { label, color }]) => { const index = parseInt(idx); return (<List.Item><div className="class-management-item"><Input type="color" value={color} className="color-picker-input" onChange={e => handleUpdateClass(index, 'color', e.target.value)} /><Input value={label} onChange={e => handleUpdateClass(index, 'label', e.target.value)} placeholder={t.className} /><Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteClass(index)} danger /></Tooltip></div></List.Item>); }} />
                                </div>
                                <Button onClick={handleAddClass} icon={<FontAwesomeIcon icon={faPlus} />} block style={{ marginTop: 16 }}>{t.addClass}</Button>
                            </div>
                        </TabPane>
                        <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCogs} /></Tooltip>} key="3">
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
// END OF FILE src/pages/FileOperate/index.tsx