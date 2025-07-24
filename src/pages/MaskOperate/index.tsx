// FILE: src / pages / MaskOperate / index.tsx
import { workspaceService } from "@/models/workspaceService";
import {
  faChevronLeft, faChevronRight,
  faCog,
  faDatabase,
  faDrawPolygon,
  faEraser,
  faFileExport,
  faFileImport,
  faList,
  faMinusCircle,
  faMousePointer,
  faPaintBrush,
  faPlus,
  faRedo,
  faRobot,
  faSearchPlus,
  faTags,
  faTrash,
  faUndo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useModel } from '@umijs/max';
import { Button, Collapse, Descriptions, Divider, Flex, Form, Input, InputNumber, Layout, List, Modal, Radio, RadioChangeEvent, Select, Space, Spin, Switch, Tabs, Tooltip, Typography, message } from 'antd';
import { saveAs } from 'file-saver';
import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiKeyPoint, ApiResponse, ApiSegment, ImageAnnotationData, UndoOperation as MaskUndoOperation, Point, ViewAnnotation, ViewBoxAnnotation, ViewDiagonalAnnotation } from './constants';
import { RESIZE_HANDLE_SIZE, defaultCategoryColors, translations } from './constants';
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;
const { TabPane } = Tabs;
const { Sider, Content, Header } = Layout;

type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete' | 'region-delete';
type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight' | 'start' | 'end';
type DraggingState = { type: 'move' | 'resize' | 'region-select' | 'magnifier-drag'; handle?: ResizeHandle; startMousePos: Point; startAnnotationState?: ViewAnnotation; offset?: Point; } | null;
type RegionSelectBox = { start: Point; end: Point; } | null;
type RegionDeleteMode = 'contain' | 'intersect';
type ImageDetails = {
  name: string;
  element: HTMLImageElement;
  width: number;
  height: number;
  originalFile: File;
};


const MAGNIFIER_SIZE = 150;
const MAGNIFIER_ZOOM = 3;
const DIAGONAL_HANDLE_SIZE = 10;

const generateUniqueId = (): string => `anno_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const rgbaToHex = (rgba: string): string => {
  if (!rgba) return '#000000';
  if (rgba.startsWith('#')) return rgba;
  const parts = rgba.match(/(\d+(\.\d+)?)/g);
  if (!parts || parts.length < 3) return '#000000';
  const r = parseInt(parts[0], 10);
  const g = parseInt(parts[1], 10);
  const b = parseInt(parts[2], 10);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
};

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

export const convertApiToView = (apiData: ApiResponse, allCategoryColors: { [key: string]: string }, thickness: number): ViewAnnotation[] => {
  const viewAnnotations: ViewAnnotation[] = [];
  if (!apiData) return viewAnnotations;

  if (apiData.key_points && apiData.segments) {
    const { key_points, segments } = apiData;
    const keyPointMap = new Map(key_points.map(p => [p.id, p]));
    segments.forEach((segment) => {
      const srcPoint = keyPointMap.get(segment.src_key_point_id);
      const dstPoint = keyPointMap.get(segment.dst_key_point_id);
      if (srcPoint && dstPoint && srcPoint.id !== dstPoint.id) {
        const category = srcPoint.net || 'unknown_net';
        const color = allCategoryColors[category] || allCategoryColors['unknown_net'] || '#CCCCCC';
        viewAnnotations.push({
          id: generateUniqueId(),
          points: [{ x: srcPoint.x, y: srcPoint.y }, { x: dstPoint.x, y: dstPoint.y }],
          category, color, thickness,
        } as ViewDiagonalAnnotation);
      }
    });
  }

  return viewAnnotations;
};

export const convertViewToApi = (viewAnnotations: ViewAnnotation[]): Pick<ApiResponse, 'key_points' | 'segments' | 'cpnts'> => {
  const key_points: ApiKeyPoint[] = [];
  const segments: ApiSegment[] = [];
  const pointMap = new Map<string, number>();
  let kptIdCounter = 0;

  const getOrCreateKeyPoint = (p: Point, net: string): number => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (pointMap.has(key)) {
      return pointMap.get(key)!;
    }
    const newId = kptIdCounter++;
    key_points.push({ id: newId, net, type: 'end', x: p.x, y: p.y, port_id: newId });
    pointMap.set(key, newId);
    return newId;
  };

  if (!Array.isArray(viewAnnotations)) {
    return { key_points: [], segments: [], cpnts: [] };
  }

  viewAnnotations.forEach(anno => {
    if ('points' in anno) {
      const srcId = getOrCreateKeyPoint(anno.points[0], anno.category);
      const dstId = getOrCreateKeyPoint(anno.points[1], anno.category);
      segments.push({ src_key_point_id: srcId, dst_key_point_id: dstId });
    }
  });

  return { key_points, segments, cpnts: [] };
};


const MaskOperate = () => {
  const { initialState } = useModel('@@initialState');
  const {
    imageKeys,
    mask_currentIndex: currentImageIndex, setMask_currentIndex: setCurrentImageIndex,
    mask_allImageAnnotations, setMask_allImageAnnotations,
    mask_categories, setMask_categories,
    mask_categoryColors, setMask_categoryColors,
    mask_selectedAnnotationId, setMask_selectedAnnotationId,
    mask_operationHistory, setMask_operationHistory,
    mask_redoHistory, setMask_redoHistory,
    isAppBusy, setAppBusy, // Bedrock Change: Use global lock
  } = useModel('annotationStore');

  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];

  const [currentImageDetails, setCurrentImageDetails] = useState<ImageDetails | null>(null);
  const [localAnnotations, setLocalAnnotations] = useState<ViewAnnotation[]>([]);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  const [netlistScsContent, setNetlistScsContent] = useState<string | null>(null);
  const [netlistCdlContent, setNetlistCdlContent] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [currentCategory, setCurrentCategory] = useState<string>(mask_categories[0] || "");
  const [currentLineWidth, setCurrentLineWidth] = useState<number>(2);
  const [showCategoryInBox, setShowCategoryInBox] = useState<boolean>(true);
  const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
  const [inspectorWidth, setInspectorWidth] = useState<number>(350);
  const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
  const [draggingState, setDraggingState] = useState<DraggingState>(null);
  const [regionSelectBox, setRegionSelectBox] = useState<RegionSelectBox | null>(null);
  const [regionDeleteMode, setRegionDeleteMode] = useState<RegionDeleteMode>('contain');
  const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isAiAnnotating, setIsAiAnnotating] = useState(false);
  const [isCurrentlyEditingId, setIsCurrentlyEditingId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const classesFileRef = useRef<HTMLInputElement>(null);

  const [isMagnifierVisible, setIsMagnifierVisible] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState<Point>({ x: 900, y: 200 });
  const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);

  const hasWorkspace = imageKeys.length > 0;
  const currentImageKey = hasWorkspace ? imageKeys[currentImageIndex] : null;
  const disabledUI = isAppBusy; // Bedrock Change: UI lock is now driven by global state

  const currentApiJson = useMemo(() => {
    if (!currentImageDetails || !currentImageKey) return {};
    const sourceApi = mask_allImageAnnotations[currentImageKey]?.apiJson || {};
    const generatedData = convertViewToApi(localAnnotations);
    return {
      ...sourceApi,
      ...generatedData,
      netlist_scs: netlistScsContent || sourceApi.netlist_scs,
      netlist_cdl: netlistCdlContent || sourceApi.netlist_cdl,
    };
  }, [currentImageDetails, currentImageKey, mask_allImageAnnotations, localAnnotations, netlistScsContent, netlistCdlContent]);

  const currentUndoStackSize = (mask_operationHistory[currentImageIndex] || []).length;
  const currentRedoStackSize = (mask_redoHistory[currentImageIndex] || []).length;

  const loadDataForIndex = useCallback(async (index: number, signal: AbortSignal) => {
    setIsTransitioning(true); // For visual spinner
    try {
      const imageKey = imageKeys[index];
      if (!imageKey) throw new Error("无效的图片索引");

      const sourceData = await workspaceService.loadDataForImage(imageKey);
      if (signal.aborted) return;

      const imageElement = await preloadImage(sourceData.pngFile, signal);
      if (signal.aborted) return;

      const dirtyData = mask_allImageAnnotations[imageKey];
      if (dirtyData) {
        setLocalAnnotations(dirtyData.viewAnnotations);
        setNetlistScsContent(dirtyData.apiJson?.netlist_scs || null);
        setNetlistCdlContent(dirtyData.apiJson?.netlist_cdl || null);
      } else {
        let apiJson: ApiResponse = {};
        if (sourceData.jsonContent) {
          try {
            apiJson = JSON.parse(sourceData.jsonContent);
          } catch (e) { console.error(`Error parsing JSON for ${imageKey}`, e); }
        }
        const initialViewAnnos = convertApiToView(apiJson, mask_categoryColors, currentLineWidth);
        setLocalAnnotations(initialViewAnnos);
        setNetlistScsContent(apiJson?.netlist_scs || null);
        setNetlistCdlContent(apiJson?.netlist_cdl || null);
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
        console.error("加载数据时出错:", error);
        message.error("加载文件数据时出错");
      }
    } finally {
      if (!signal.aborted) {
        setIsTransitioning(false);
      }
    }
  }, [imageKeys, mask_categoryColors, currentLineWidth, mask_allImageAnnotations]);

  const handleNavigation = useCallback(async (offset: number) => {
    if (isAppBusy) return;
    const newIndex = currentImageIndex + offset;
    if (newIndex >= 0 && newIndex < imageKeys.length) {
      if (currentImageKey) {
        const dirtyData: ImageAnnotationData = {
          viewAnnotations: localAnnotations,
          apiJson: currentApiJson,
        };
        setMask_allImageAnnotations(prev => ({ ...prev, [currentImageKey]: dirtyData }));
      }
      await workspaceService.saveLastIndices({ maskOperateIndex: newIndex });
      setCurrentImageIndex(newIndex);
    }
  }, [isAppBusy, currentImageIndex, imageKeys.length, currentImageKey, localAnnotations, currentApiJson, setMask_allImageAnnotations, setCurrentImageIndex]);

  useEffect(() => {
    if (!hasWorkspace || currentImageIndex < 0) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAppBusy(true); // Lock the app

    loadDataForIndex(currentImageIndex, controller.signal).finally(() => {
      if (!controller.signal.aborted) {
        setAppBusy(false); // Unlock the app
      }
    });

    return () => {
      controller.abort();
    }
  }, [currentImageIndex, hasWorkspace, loadDataForIndex, setAppBusy]);


  const getResizeHandles = (box: ViewBoxAnnotation): { [key in ResizeHandle]?: { x: number, y: number, size: number, cursor: string } } => {
    const s = RESIZE_HANDLE_SIZE; const { x, y, width, height } = box;
    return { topLeft: { x: x - s / 2, y: y - s / 2, size: s, cursor: 'nwse-resize' }, top: { x: x + width / 2 - s / 2, y: y - s / 2, size: s, cursor: 'ns-resize' }, topRight: { x: x + width - s / 2, y: y - s / 2, size: s, cursor: 'nesw-resize' }, left: { x: x - s / 2, y: y + height / 2 - s / 2, size: s, cursor: 'ew-resize' }, right: { x: x + width - s / 2, y: y + height / 2 - s / 2, size: s, cursor: 'ew-resize' }, bottomLeft: { x: x - s / 2, y: y + height - s / 2, size: s, cursor: 'nesw-resize' }, bottom: { x: x + width / 2 - s / 2, y: y + height - s / 2, size: s, cursor: 'ns-resize' }, bottomRight: { x: x + width - s / 2, y: y + height - s / 2, size: s, cursor: 'nwse-resize' }, };
  };
  const getDiagonalParameters = (points: [Point, Point]) => { const dx = points[1].x - points[0].x; const dy = points[1].y - points[0].y; return { angleRad: Math.atan2(dy, dx), length: Math.sqrt(dx * dx + dy * dy), centerX: (points[0].x + points[1].x) / 2, centerY: (points[0].y + points[1].y) / 2, }; };

  const renderRectangle = useCallback((box: ViewBoxAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    ctx.save();
    if (isPreview) {
      ctx.setLineDash([8, 4]); ctx.strokeStyle = "#4096ff"; ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    } else {
      const color = isSelected ? '#4096ff' : box.color;
      ctx.globalAlpha = isSelected ? 1.0 : 0.75;
      ctx.fillStyle = color;
      ctx.strokeStyle = isSelected ? "#0958d9" : "rgba(0,0,0,0.8)";
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      ctx.globalAlpha = 1.0;
      if (showCategoryInBox) {
        ctx.fillStyle = "#262626"; ctx.font = "bold 12px Arial"; ctx.textBaseline = "top";
        ctx.fillText(box.category, box.x + 4, box.y + 4, box.width - 8);
      }
      if (isSelected) {
        const handles = getResizeHandles(box); ctx.fillStyle = '#0958d9';
        Object.values(handles).forEach(handle => { if (handle) ctx.fillRect(handle.x, handle.y, handle.size, handle.size) });
      }
    }
    ctx.restore();
  }, [showCategoryInBox]);

  const renderDiagonal = useCallback((diag: ViewDiagonalAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    const { angleRad, length, centerX, centerY } = getDiagonalParameters(diag.points); if (length === 0) return;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angleRad);

    const color = isSelected ? '#4096ff' : diag.color;
    const lineWidth = isSelected ? 3 : 1;

    ctx.globalAlpha = isSelected ? 1.0 : 0.8;
    ctx.fillStyle = color;
    ctx.strokeStyle = isSelected ? "#0958d9" : "rgba(0,0,0,0.6)";

    if (isPreview) {
      ctx.setLineDash([8, 4]);
      ctx.lineWidth = 2;
    } else {
      ctx.lineWidth = lineWidth;
    }

    ctx.beginPath();
    ctx.rect(-length / 2, -diag.thickness / 2, length, diag.thickness);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (isSelected) {
      ctx.save();
      ctx.fillStyle = '#0958d9';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      [diag.points[0], diag.points[1]].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, DIAGONAL_HANDLE_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    if (!isPreview && showCategoryInBox) {
      ctx.save();
      ctx.fillStyle = "#262626";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(diag.category, centerX, centerY - diag.thickness / 2 - 5);
      ctx.restore();
    }
  }, [showCategoryInBox]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    if (currentImageDetails && currentImageDetails.element) {
      const img = currentImageDetails.element;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      localAnnotations.forEach((anno: ViewAnnotation) => {
        if (anno.id !== mask_selectedAnnotationId) {
          if ('points' in anno) renderDiagonal(anno, ctx, false, false);
          else renderRectangle(anno, ctx, false, false);
        }
      });

      const selectedAnno = localAnnotations.find(a => a.id === mask_selectedAnnotationId);
      if (selectedAnno) {
        if ('points' in selectedAnno) renderDiagonal(selectedAnno, ctx, false, true);
        else renderRectangle(selectedAnno, ctx, false, true);
      }

      if (draggingState && (activeTool === 'rectangle' || activeTool === 'diagonal')) {
        const { startMousePos } = draggingState;
        if (activeTool === 'rectangle') {
          const previewRect: ViewBoxAnnotation = { id: 'preview', x: Math.min(startMousePos.x, canvasMousePos.x), y: Math.min(startMousePos.y, canvasMousePos.y), width: Math.abs(startMousePos.x - canvasMousePos.x), height: Math.abs(startMousePos.y - canvasMousePos.y), category: currentCategory, color: 'preview', sourceLineWidth: currentLineWidth };
          renderRectangle(previewRect, ctx, true);
        } else {
          const previewDiag: ViewDiagonalAnnotation = { id: 'preview', points: [startMousePos, canvasMousePos], category: currentCategory, color: 'preview', thickness: currentLineWidth };
          renderDiagonal(previewDiag, ctx, true);
        }
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
  }, [currentImageDetails, localAnnotations, mask_selectedAnnotationId, activeTool, draggingState, canvasMousePos, t.noImages, renderDiagonal, renderRectangle, currentCategory, currentLineWidth, regionSelectBox, isTransitioning]);

  const getScaledCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement> | { clientX: number, clientY: number }): Point => {
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


  useEffect(() => { setCurrentLang(initialState?.language || 'zh'); }, [initialState?.language]);

  useEffect(() => {
    if (mask_categories.length > 0 && (!currentCategory || !mask_categories.includes(currentCategory))) { setCurrentCategory(mask_categories[0]); }
    else if (mask_categories.length === 0 && currentCategory !== "") { setCurrentCategory(""); }
  }, [mask_categories, currentCategory]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);

  useEffect(() => {
    const handleResize = () => redrawCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redrawCanvas]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingInspector) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) setInspectorWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizingInspector(false);
    if (isResizingInspector) {
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingInspector]);

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

  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }): boolean => (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);

  const addUndoRecord = useCallback(() => {
    if (!currentImageDetails) return;
    const operation: MaskUndoOperation = { imageId: currentImageDetails.name, previousViewAnnotations: localAnnotations, previousApiJson: currentApiJson };
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: [...(prev[currentImageIndex] || []), operation] }));
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: [] }));
  }, [currentImageDetails, currentImageIndex, localAnnotations, currentApiJson, setMask_operationHistory, setMask_redoHistory]);

  const updateGlobalAnnotations = useCallback((newViewAnnotations: ViewAnnotation[]) => {
    if (!currentImageKey) return;
    const newApiJson = convertViewToApi(newViewAnnotations);
    setMask_allImageAnnotations(prev => ({
      ...prev,
      [currentImageKey]: {
        ...prev[currentImageKey],
        viewAnnotations: newViewAnnotations,
        apiJson: {
          ...(prev[currentImageKey]?.apiJson || {}),
          ...newApiJson,
        },
      },
    }));
  }, [currentImageKey, setMask_allImageAnnotations]);

  const handleAnnotationPropertyUpdate = useCallback((annoId: string, updates: Partial<ViewAnnotation>) => {
    const newAnnos = localAnnotations.map(a => a.id === annoId ? { ...a, ...updates } : a);
    setLocalAnnotations(newAnnos);
    updateGlobalAnnotations(newAnnos);
  }, [localAnnotations, updateGlobalAnnotations]);

  const handleEditFocus = useCallback((annotationId: string) => {
    if (isCurrentlyEditingId !== annotationId) {
      addUndoRecord();
      setIsCurrentlyEditingId(annotationId);
    }
  }, [isCurrentlyEditingId, addUndoRecord]);

  const addAnnotation = useCallback((newAnnotation: ViewAnnotation) => {
    addUndoRecord();
    const newAnnos = [...localAnnotations, newAnnotation];
    setLocalAnnotations(newAnnos);
    updateGlobalAnnotations(newAnnos);
  }, [addUndoRecord, localAnnotations, updateGlobalAnnotations]);

  const removeAnnotationById = useCallback((idToRemove: string) => {
    addUndoRecord();
    const updatedAnnotations = localAnnotations.filter(a => a.id !== idToRemove);
    setLocalAnnotations(updatedAnnotations);
    updateGlobalAnnotations(updatedAnnotations);
    if (mask_selectedAnnotationId === idToRemove) setMask_selectedAnnotationId(null);
    message.success(`${t.deleteAnnotationTooltip} ${t.operationSuccessful}`);
  }, [localAnnotations, addUndoRecord, updateGlobalAnnotations, t, mask_selectedAnnotationId, setMask_selectedAnnotationId]);

  const performUndo = useCallback(() => {
    const history = mask_operationHistory[currentImageIndex] || []; if (history.length === 0 || !currentImageDetails) return;
    const lastOp = history[history.length - 1];
    const redoOp: MaskUndoOperation = { imageId: currentImageDetails.name, previousViewAnnotations: localAnnotations, previousApiJson: currentApiJson };
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: [redoOp, ...(prev[currentImageIndex] || [])] }));
    setLocalAnnotations(lastOp.previousViewAnnotations);
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: history.slice(0, -1) }));
    message.success(t.operationSuccessful);
  }, [mask_operationHistory, currentImageIndex, currentImageDetails, localAnnotations, currentApiJson, setMask_redoHistory, setMask_operationHistory, t.operationSuccessful]);

  const performRedo = useCallback(() => {
    const history = mask_redoHistory[currentImageIndex] || []; if (history.length === 0 || !currentImageDetails) return;
    const redoOp = history[0];
    const undoOp: MaskUndoOperation = { imageId: currentImageDetails.name, previousViewAnnotations: localAnnotations, previousApiJson: currentApiJson };
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: [...(prev[currentImageIndex] || []), undoOp] }));
    setLocalAnnotations(redoOp.previousViewAnnotations);
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: history.slice(1) }));
    message.success(t.operationSuccessful);
  }, [mask_redoHistory, currentImageIndex, currentImageDetails, localAnnotations, currentApiJson, setMask_operationHistory, setMask_redoHistory, t.operationSuccessful]);

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

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageDetails || !canvasRef.current || e.button !== 0) return;

    const mousePos = getScaledCoords(e);
    if (activeTool === 'select') {
      const selectedAnno = localAnnotations.find(a => a.id === mask_selectedAnnotationId);
      if (selectedAnno) {
        if ('width' in selectedAnno) {
          const handles = getResizeHandles(selectedAnno);
          for (const handleKey of Object.keys(handles) as (keyof typeof handles)[]) {
            const handle = handles[handleKey]; if (handle && isPointInRect(mousePos, { x: handle.x, y: handle.y, width: handle.size, height: handle.size })) {
              addUndoRecord(); setDraggingState({ type: 'resize', handle: handleKey, startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
            }
          }
        } else if ('points' in selectedAnno) {
          const distToStart = Math.hypot(mousePos.x - selectedAnno.points[0].x, mousePos.y - selectedAnno.points[0].y);
          const distToEnd = Math.hypot(mousePos.x - selectedAnno.points[1].x, mousePos.y - selectedAnno.points[1].y);
          if (distToStart < DIAGONAL_HANDLE_SIZE) {
            addUndoRecord(); setDraggingState({ type: 'resize', handle: 'start', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
          }
          if (distToEnd < DIAGONAL_HANDLE_SIZE) {
            addUndoRecord(); setDraggingState({ type: 'resize', handle: 'end', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
          }
        }
      }

      const clickedAnnotation = [...localAnnotations].reverse().find((anno: ViewAnnotation) => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points); const translatedX = mousePos.x - centerX; const translatedY = mousePos.y - centerY; const rotatedX = translatedX * Math.cos(-angleRad) - translatedY * Math.sin(-angleRad); const rotatedY = translatedX * Math.sin(-angleRad) + translatedY * Math.cos(-angleRad);
          return Math.abs(rotatedX) <= length / 2 && Math.abs(rotatedY) <= anno.thickness / 2;
        } else return isPointInRect(mousePos, anno);
      });
      if (clickedAnnotation) {
        if (mask_selectedAnnotationId !== clickedAnnotation.id) {
          setMask_selectedAnnotationId(clickedAnnotation.id);
        } else {
          addUndoRecord();
          setDraggingState({ type: 'move', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(clickedAnnotation)) });
        }
      } else {
        setMask_selectedAnnotationId(null);
      }
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      if (!currentCategory) { message.warning(t.noCategoriesFound); return; }
      setDraggingState({ type: 'move', startMousePos: mousePos });
    } else if (activeTool === 'region-delete') {
      setDraggingState({ type: 'region-select', startMousePos: mousePos });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const currentCanvasMousePos = getScaledCoords(e);
    setCanvasMousePos(currentCanvasMousePos);

    if (!draggingState || !currentImageDetails) {
      return;
    }

    if (draggingState.type === 'region-select') {
      setRegionSelectBox({ start: draggingState.startMousePos, end: currentCanvasMousePos });
      redrawCanvas();
    } else if (activeTool === 'select') {
      if (draggingState.startAnnotationState?.id) {
        const dx = currentCanvasMousePos.x - draggingState.startMousePos.x; const dy = currentCanvasMousePos.y - draggingState.startMousePos.y;
        const startState = draggingState.startAnnotationState;
        const updatedAnnos = localAnnotations.map(anno => {
          if (anno.id === startState.id) {
            let newAnno: ViewAnnotation = JSON.parse(JSON.stringify(anno));
            if (draggingState.type === 'move') {
              if ('points' in newAnno && 'points' in startState) {
                newAnno.points[0] = { x: startState.points[0].x + dx, y: startState.points[0].y + dy };
                newAnno.points[1] = { x: startState.points[1].x + dx, y: startState.points[1].y + dy };
              } else if ('x' in newAnno && 'x' in startState) { newAnno.x = startState.x + dx; newAnno.y = startState.y + dy; }
            } else if (draggingState.type === 'resize' && draggingState.handle) {
              if ('width' in newAnno && 'width' in startState) {
                const { handle } = draggingState; const startBox = startState;
                if (handle.includes('right')) newAnno.width = Math.max(1, startBox.width + dx);
                if (handle.includes('left')) { newAnno.x = startBox.x + dx; newAnno.width = Math.max(1, startBox.width - dx); }
                if (handle.includes('bottom')) newAnno.height = Math.max(1, startBox.height + dy);
                if (handle.includes('top')) { newAnno.y = startBox.y + dy; newAnno.height = Math.max(1, startBox.height - dy); }
              } else if ('points' in newAnno && (draggingState.handle === 'start' || draggingState.handle === 'end')) {
                if (draggingState.handle === 'start') newAnno.points[0] = currentCanvasMousePos;
                else newAnno.points[1] = currentCanvasMousePos;
              }
            }
            return newAnno;
          }
          return anno;
        });
        setLocalAnnotations(updatedAnnos);
      }
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState || e.button !== 0) return;
    const end = getScaledCoords(e);

    if (activeTool === 'select') {
      updateGlobalAnnotations(localAnnotations);
    } else if (draggingState.type === 'region-select') {
      const start = draggingState.startMousePos;
      const selRect = {
        x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y)
      };

      const idsToDelete = new Set<string>();
      localAnnotations.forEach(anno => {
        let annoRect: { x: number, y: number, width: number, height: number };
        if ('width' in anno) {
          annoRect = { x: anno.x, y: anno.y, width: anno.width, height: anno.height };
        } else {
          const x1 = Math.min(anno.points[0].x, anno.points[1].x);
          const y1 = Math.min(anno.points[0].y, anno.points[1].y);
          const x2 = Math.max(anno.points[0].x, anno.points[1].x);
          const y2 = Math.max(anno.points[0].y, anno.points[1].y);
          annoRect = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        }

        let shouldDelete = false;
        if (regionDeleteMode === 'contain') {
          shouldDelete = (annoRect.x >= selRect.x && annoRect.y >= selRect.y && annoRect.x + annoRect.width <= selRect.x + selRect.width && annoRect.y + annoRect.height <= selRect.y + selRect.height);
        } else {
          shouldDelete = !(annoRect.x > selRect.x + selRect.width || annoRect.x + annoRect.width < selRect.x || annoRect.y > selRect.y + selRect.height || annoRect.y + annoRect.height < selRect.y);
        }
        if (shouldDelete) {
          idsToDelete.add(anno.id);
        }
      });

      if (idsToDelete.size > 0) {
        addUndoRecord();
        const updatedAnnotations = localAnnotations.filter(a => !idsToDelete.has(a.id));
        setLocalAnnotations(updatedAnnotations);
        updateGlobalAnnotations(updatedAnnotations);
        if (mask_selectedAnnotationId && idsToDelete.has(mask_selectedAnnotationId)) {
          setMask_selectedAnnotationId(null);
        }
        message.success(`删除了 ${idsToDelete.size} 个标注。`);
      }
      setRegionSelectBox(null);
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      const start = draggingState.startMousePos;
      const color = mask_categoryColors[currentCategory] || '#cccccc';
      if (activeTool === 'rectangle') {
        const width = Math.abs(start.x - end.x); const height = Math.abs(start.y - end.y);
        if (width > 2 && height > 2) {
          const newRect: ViewBoxAnnotation = { id: generateUniqueId(), x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height, category: currentCategory, color, sourceLineWidth: currentLineWidth };
          addAnnotation(newRect);
        }
      } else if (activeTool === 'diagonal') {
        const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        if (length > 2) {
          const newDiag: ViewDiagonalAnnotation = { id: generateUniqueId(), points: [start, end], category: currentCategory, color, thickness: currentLineWidth };
          addAnnotation(newDiag);
        }
      }
    }
    setDraggingState(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageDetails || draggingState || e.button !== 0) return;
    const clickPos = getScaledCoords(e);

    if (activeTool === 'delete') {
      const annoToDelete = [...localAnnotations].reverse().find((anno: ViewAnnotation) => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points);
          const t_mousePos = { x: clickPos.x - centerX, y: clickPos.y - centerY };
          const r_mousePos = { x: t_mousePos.x * Math.cos(-angleRad) - t_mousePos.y * Math.sin(-angleRad), y: t_mousePos.x * Math.sin(-angleRad) + t_mousePos.y * Math.cos(-angleRad) };
          return Math.abs(r_mousePos.x) <= length / 2 && Math.abs(r_mousePos.y) <= anno.thickness / 2;
        } else return isPointInRect(clickPos, anno);
      });
      if (annoToDelete) removeAnnotationById(annoToDelete.id);
    }
  };

  const handleAiAnnotation = async () => {
    if (!currentImageDetails) { message.warning(t.noImages); return; }
    if (isAppBusy) { message.warning("应用正忙，请稍后再试。"); return; }

    setIsAiAnnotating(true);
    setAppBusy(true); // Lock
    message.loading({ content: t.aiAnnotating, key: 'ai-annotation', duration: 0 });

    try {
      const formData = new FormData();
      formData.append('file', currentImageDetails.originalFile, currentImageDetails.originalFile.name);

      const response = await fetch('http://111.229.103.50:8199/process/', {
        method: 'POST',
        body: formData
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
      const apiResult: ApiResponse = await response.json();

      if (!apiResult || !apiResult.key_points || !apiResult.segments) {
        message.info({ content: "AI 未返回任何有效的连线标注。", key: 'ai-annotation', duration: 3 });
        return;
      }

      setNetlistScsContent(apiResult.netlist_scs || null);
      setNetlistCdlContent(apiResult.netlist_cdl || null);

      const tempViewAnnotations = convertApiToView(apiResult, mask_categoryColors, currentLineWidth);

      const newCatNames = [...new Set(tempViewAnnotations.map(a => a.category))];
      const newlyDiscoveredCats = newCatNames.filter(name => !mask_categories.includes(name));
      let updatedCategoryColors = { ...mask_categoryColors };
      if (newlyDiscoveredCats.length > 0) {
        const newCategories = [...mask_categories, ...newlyDiscoveredCats];
        newlyDiscoveredCats.forEach((cat) => {
          if (!updatedCategoryColors[cat]) {
            const colorPool = Object.values(defaultCategoryColors);
            updatedCategoryColors[cat] = rgbaToHex(colorPool[newCategories.indexOf(cat) % colorPool.length]);
          }
        });
        setMask_categories(newCategories);
        setMask_categoryColors(updatedCategoryColors);
      }

      const finalViewAnnotations = convertApiToView(apiResult, updatedCategoryColors, currentLineWidth);

      addUndoRecord();
      setLocalAnnotations(finalViewAnnotations);
      updateGlobalAnnotations(finalViewAnnotations);
      message.success({ content: `${t.operationSuccessful}: ${finalViewAnnotations.length} annotations loaded.`, key: 'ai-annotation', duration: 3 });

    } catch (error: any) {
      console.error("AI Annotation failed:", error);
      message.error({ content: `${t.aiFailed}: ${error.message}`, key: 'ai-annotation', duration: 5 });
    } finally {
      setIsAiAnnotating(false);
      setAppBusy(false); // Unlock
    }
  };

  const handleAddClass = () => {
    const newClassName = `new_class_${mask_categories.filter(c => c.startsWith('new_class')).length}`; if (mask_categories.includes(newClassName)) return;
    const newCategories = [...mask_categories, newClassName];
    const newColor = Object.values(defaultCategoryColors)[newCategories.length % Object.keys(defaultCategoryColors).length];
    const newCategoryColors = { ...mask_categoryColors, [newClassName]: rgbaToHex(newColor) };
    setMask_categories(newCategories); setMask_categoryColors(newCategoryColors); setCurrentCategory(newClassName);
  };
  const handleUpdateClass = (oldName: string, newName: string) => {
    if (newName === oldName || newName.trim() === '' || mask_categories.includes(newName)) return;
    const newNameTrimmed = newName.trim();
    setMask_categories(prev => prev.map(c => c === oldName ? newNameTrimmed : c));
    setMask_categoryColors(prev => { const newColors = { ...prev }; newColors[newNameTrimmed] = newColors[oldName]; delete newColors[oldName]; return newColors; });

    const newAllAnnos = { ...mask_allImageAnnotations };
    Object.keys(newAllAnnos).forEach(imgName => {
      const updatedViewAnnos = (newAllAnnos[imgName].viewAnnotations || []).map(anno => anno.category === oldName ? { ...anno, category: newNameTrimmed } : anno);
      newAllAnnos[imgName] = { ...newAllAnnos[imgName], viewAnnotations: updatedViewAnnos };
    });
    setMask_allImageAnnotations(newAllAnnos);

    if (currentCategory === oldName) setCurrentCategory(newNameTrimmed);
  };
  const handleUpdateColor = (catName: string, newColor: string) => {
    setMask_categoryColors(prev => ({ ...prev, [catName]: newColor }));
    const newAllAnnos = { ...mask_allImageAnnotations };
    Object.keys(newAllAnnos).forEach(imgName => {
      const updatedViewAnnos = (newAllAnnos[imgName].viewAnnotations || []).map(anno => anno.category === catName ? { ...anno, color: newColor } : anno);
      newAllAnnos[imgName] = { ...newAllAnnos[imgName], viewAnnotations: updatedViewAnnos };
    });
    setMask_allImageAnnotations(newAllAnnos);
  };
  const handleDeleteClass = (className: string) => {
    const title = t.deleteClassConfirmTitle ? t.deleteClassConfirmTitle.replace('%s', className) : `确认删除类别 ${className}?`;
    Modal.confirm({
      title: title,
      content: t.deleteClassConfirmContent, okText: t.confirmDelete, okType: 'danger', cancelText: t.cancel,
      onOk: () => {
        const newCategories = mask_categories.filter(c => c !== className);
        const newCategoryColors = { ...mask_categoryColors };
        delete newCategoryColors[className];

        const newAllAnnotations = { ...mask_allImageAnnotations };
        Object.keys(newAllAnnotations).forEach(imgName => {
          const currentAnnos = newAllAnnotations[imgName];
          if (currentAnnos && currentAnnos.apiJson) {
            const filteredKeyPoints = (currentAnnos.apiJson.key_points || []).filter(kp => kp.net !== className);
            const filteredKeyPointIds = new Set(filteredKeyPoints.map(kp => kp.id));
            const filteredSegments = (currentAnnos.apiJson.segments || []).filter(
              seg => filteredKeyPointIds.has(seg.src_key_point_id) && filteredKeyPointIds.has(seg.dst_key_point_id)
            );
            currentAnnos.apiJson.key_points = filteredKeyPoints;
            currentAnnos.apiJson.segments = filteredSegments;
          }
        });

        setMask_categories(newCategories);
        setMask_categoryColors(newCategoryColors);
        setMask_allImageAnnotations(newAllAnnotations);
        if (currentCategory === className) setCurrentCategory(newCategories[0] || "");
        message.success(t.classDeleted.replace('%s', className));
      }
    });
  };

  const handleExportClasses = () => {
    if (mask_categories.length === 0) { message.info('没有可导出的类别。'); return; }
    const exportClassObj: { [key: string]: string } = {};
    mask_categories.forEach((cat, index) => { exportClassObj[index] = cat; });
    const classText = `classes = ${JSON.stringify(exportClassObj, null, 4)}`;
    const blob = new Blob([classText], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'classes.txt');
    message.success('类别导出成功。');
  };

  const handleImportClasses = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try {
      const jsonStringMatch = text.match(/=\s*({[\s\S]*})/);
      if (!jsonStringMatch || !jsonStringMatch[1]) throw new Error("无效格式：找不到对象字面量 '{...}'。");

      const jsonString = jsonStringMatch[1];
      const parsedObject = new Function(`return ${jsonString}`)();
      if (typeof parsedObject !== 'object' || parsedObject === null) throw new Error("解析的内容不是有效的对象。");

      const importedCats: { index: number; label: string }[] = [];
      for (const key in parsedObject) {
        if (Object.prototype.hasOwnProperty.call(parsedObject, key)) {
          const index = parseInt(key, 10);
          const label = parsedObject[key];
          if (!isNaN(index) && typeof label === 'string') {
            importedCats.push({ index, label });
          }
        }
      }
      if (importedCats.length === 0) throw new Error("在文件中未找到有效的类别条目。");

      importedCats.sort((a, b) => a.index - b.index);
      const newCatNames = importedCats.map(c => c.label);
      const newCatColors: { [key: string]: string } = {};
      const defaultColorValues = Object.values(defaultCategoryColors).map(rgbaToHex);
      newCatNames.forEach((cat, i) => {
        newCatColors[cat] = mask_categoryColors[cat] || defaultColorValues[i % defaultColorValues.length];
      });

      setMask_categories(newCatNames);
      setMask_categoryColors(newCatColors);
      if (newCatNames.length > 0) setCurrentCategory(newCatNames[0]);
      message.success(`${newCatNames.length} 个类别已导入。`);

    } catch (error: any) {
      console.error("导入类别失败:", error);
      message.error(`导入类别失败: ${error.message}`);
    } finally {
      if (classesFileRef.current) classesFileRef.current.value = "";
    }
  };

  const handleClearAnnotations = () => {
    if (!currentImageDetails || localAnnotations.length === 0) return;
    addUndoRecord();
    setLocalAnnotations([]);
    updateGlobalAnnotations([]);
    setMask_selectedAnnotationId(null); message.success(t.clearAnnotationsButton + ' ' + t.operationSuccessful);
  };

  const isSelectedForEdit = (item: ViewAnnotation) => activeTool === 'select' && item.id === mask_selectedAnnotationId;

  const getCanvasCursor = () => {
    if (isMagnifierVisible) return 'none';
    switch (activeTool) {
      case 'delete': return 'delete-cursor';
      case 'rectangle': case 'diagonal': case 'region-delete': return 'draw-cursor';
      default: return 'default';
    }
  }

  return (
    <Layout className="unified-layout">
      <Header className="unified-top-header">
        <div className="header-left-controls">
        </div>
        <Space className="header-center-controls">
          <Button icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => handleNavigation(-1)} disabled={!hasWorkspace || currentImageIndex === 0 || disabledUI} />
          <Text className="current-file-text" title={currentImageDetails?.name}>{currentImageDetails ? `${t.currentImage}: ${currentImageDetails.name} (${currentImageIndex + 1}/${imageKeys.length})` : t.noImages}</Text>
          <Button icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => handleNavigation(1)} disabled={!hasWorkspace || currentImageIndex >= imageKeys.length - 1 || disabledUI} />
        </Space>
        <div className="header-right-controls">
          <Tooltip title={t.undo}><Button icon={<FontAwesomeIcon icon={faUndo} />} onClick={performUndo} disabled={currentUndoStackSize === 0 || disabledUI} /></Tooltip>
          <Tooltip title={t.redo}><Button icon={<FontAwesomeIcon icon={faRedo} />} onClick={performRedo} disabled={currentRedoStackSize === 0 || disabledUI} /></Tooltip>
        </div>
      </Header>
      <Layout hasSider>
        <Sider width={60} className="unified-tool-sider" theme="light">
          <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: '16px' }}>
            <Tooltip title={t.selectTool} placement="right"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
            <Tooltip title={t.magnifier} placement="right"><Button onClick={() => setIsMagnifierVisible(p => !p)} type={isMagnifierVisible ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faSearchPlus} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
            <Tooltip title={t.rectTool} placement="right"><Button onClick={() => setActiveTool('rectangle')} type={activeTool === 'rectangle' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
            <Tooltip title={t.diagonalTool} placement="right"><Button onClick={() => setActiveTool('diagonal')} type={activeTool === 'diagonal' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faDrawPolygon} />} disabled={!hasWorkspace || disabledUI} /></Tooltip>
            <Tooltip title={t.deleteTool} placement="right"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={!hasWorkspace || disabledUI} /></Tooltip>
            <Tooltip title={t.regionDelete} placement="right"><Button onClick={() => setActiveTool('region-delete')} type={activeTool === 'region-delete' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faEraser} />} danger={activeTool === 'region-delete'} disabled={!hasWorkspace || disabledUI} /></Tooltip>
            <Divider style={{ margin: '8px 0' }} />
            <Tooltip title={t.aiAnnotate} placement="right"><Button onClick={handleAiAnnotation} type="text" className="tool-button" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!currentImageDetails || disabledUI} /></Tooltip>
          </Space>
        </Sider>
        <Layout className="main-content-wrapper">
          <Content className="canvas-content">
            {isTransitioning && <div className="transition-overlay"><Spin size="large" /></div>}
            <div className={`canvas-wrapper`}>
              <canvas ref={canvasRef} onMouseDown={disabledUI ? undefined : handleCanvasMouseDown} onMouseMove={disabledUI ? undefined : handleCanvasMouseMove} onMouseUp={disabledUI ? undefined : handleCanvasMouseUp} onClick={disabledUI ? undefined : handleCanvasClick} className={getCanvasCursor()} onMouseEnter={() => setIsMouseOnCanvas(true)} onMouseLeave={() => setIsMouseOnCanvas(false)} />
            </div>
            {isMagnifierVisible && (
              <div style={{ position: 'fixed', top: magnifierPos.y, left: magnifierPos.x, width: MAGNIFIER_SIZE, height: MAGNIFIER_SIZE, border: '2px solid #4096ff', borderRadius: '50%', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', cursor: 'move', overflow: 'hidden', }} onMouseDown={handleMagnifierMouseDown} >
                <canvas ref={magnifierCanvasRef} width={MAGNIFIER_SIZE} height={MAGNIFIER_SIZE} style={{ cursor: 'none' }} />
              </div>
            )}
          </Content>
          {!isInspectorVisible && (<Tooltip title={t.showPanel} placement="left"><Button className="show-inspector-handle" type="primary" icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => setIsInspectorVisible(true)} /></Tooltip>)}
        </Layout>
        <div className="resizer-horizontal" onMouseDown={() => setIsResizingInspector(true)} style={{ display: isInspectorVisible ? 'flex' : 'none', cursor: 'ew-resize' }} />
        <Sider width={isInspectorVisible ? inspectorWidth : 0} className="unified-inspector-sider" theme="light" collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
          <Tabs defaultActiveKey="1" className="inspector-tabs" tabBarExtraContent={<Tooltip title={t.hidePanel}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(false)} /></Tooltip>}>
            <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="1" disabled={disabledUI}>
              <div className="tab-pane-content">
                {hasWorkspace && localAnnotations.length > 0 ? (
                  <div className="annotation-collapse-container">
                    <Collapse accordion activeKey={mask_selectedAnnotationId || undefined} onChange={(key) => { const newKey = Array.isArray(key) ? key[0] : (typeof key === 'string' ? key : null); setMask_selectedAnnotationId(newKey); setIsCurrentlyEditingId(null); }} ghost>
                      {localAnnotations.map((item) => (
                        <Panel key={item.id} className="annotation-panel-item" header={
                          <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                            <Space onClick={(e) => e.stopPropagation()}>
                              <div className="color-indicator" style={{ backgroundColor: item.color }} />
                              <Text className="category-name-text" title={item.category} ellipsis>{item.category}</Text>
                            </Space>
                            <Tooltip title={t.deleteAnnotationTooltip}><Button size="small" type="text" danger icon={<FontAwesomeIcon icon={faTrash} />} onClick={(e) => { e.stopPropagation(); removeAnnotationById(item.id); }} /></Tooltip>
                          </Flex>}>
                          <Descriptions bordered size="small" column={1} className="annotation-details">
                            {'width' in item ? (
                              <>
                                <Descriptions.Item label="Type">Rectangle</Descriptions.Item>
                                <Descriptions.Item label="X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { x: v || 0 })} /> : item.x.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label="Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { y: v || 0 })} /> : item.y.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label="Width">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={item.width} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { width: v || 1 })} /> : item.width.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label="Height">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={item.height} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { height: v || 1 })} /> : item.height.toFixed(1)}</Descriptions.Item>
                              </>
                            ) : (
                              <>
                                <Descriptions.Item label="Type">Diagonal</Descriptions.Item>
                                <Descriptions.Item label="P1.X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[0].x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [{ ...item.points[0], x: v || 0 }, item.points[1]] })} /> : item.points[0].x.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label="P1.Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[0].y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [{ ...item.points[0], y: v || 0 }, item.points[1]] })} /> : item.points[0].y.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label="P2.X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[1].x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [item.points[0], { ...item.points[1], x: v || 0 }] })} /> : item.points[1].x.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label="P2.Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[1].y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [item.points[0], { ...item.points[1], y: v || 0 }] })} /> : item.points[1].y.toFixed(1)}</Descriptions.Item>
                                <Descriptions.Item label={t.thicknessLabel}>{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={item.thickness} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { thickness: v || 1 })} /> : item.thickness}</Descriptions.Item>
                              </>
                            )}
                          </Descriptions>
                        </Panel>
                      ))}
                    </Collapse>
                  </div>
                ) : <Text type="secondary" style={{ textAlign: 'center', display: 'block', paddingTop: '20px' }}>{hasWorkspace ? t.noAnnotations : t.noImages}</Text>}
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.rawData} placement="bottom"><FontAwesomeIcon icon={faDatabase} /></Tooltip>} key="4" disabled={disabledUI}>
              <div className="tab-pane-content data-view-container">
                <div className="data-view-item">
                  <Title level={5}>Core Annotation Data (In Memory)</Title>
                  <textarea className="data-content-textarea" readOnly value={JSON.stringify(convertViewToApi(localAnnotations), null, 2)} placeholder="Key points and segments data will be shown here." />
                </div>
                <div className="data-view-item">
                  <Title level={5}>Netlist (.scs)</Title>
                  <textarea className="data-content-textarea" readOnly value={netlistScsContent || ""} placeholder="Netlist (SCS format) will be shown here after processing." />
                </div>
                <div className="data-view-item">
                  <Title level={5}>Netlist (.cdl)</Title>
                  <textarea className="data-content-textarea" readOnly value={netlistCdlContent || ""} placeholder="Netlist (CDL format) will be shown here after processing." />
                </div>
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2" disabled={disabledUI}>
              <div className="tab-pane-content">
                <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                  <Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title>
                  <Space.Compact>
                    <Tooltip title={t.importClasses}><Button icon={<FontAwesomeIcon icon={faFileImport} />} onClick={() => classesFileRef.current?.click()} /></Tooltip>
                    <Tooltip title={t.exportClasses}><Button icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportClasses} /></Tooltip>
                  </Space.Compact>
                </Flex>
                <input ref={classesFileRef} type="file" accept=".txt" onChange={handleImportClasses} style={{ display: 'none' }} />
                <div className="class-list-container">
                  <List size="small" dataSource={mask_categories} renderItem={(cat: string) => (
                    <List.Item>
                      <div className="class-management-item">
                        <input type="color" value={mask_categoryColors[cat] || '#cccccc'} onChange={(e: ChangeEvent<HTMLInputElement>) => handleUpdateColor(cat, e.target.value)} className="color-picker-input" />
                        <Input defaultValue={cat} onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => handleUpdateClass(cat, e.currentTarget.value)} onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleUpdateClass(cat, e.currentTarget.value)} placeholder={t.className} />
                        <Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteClass(cat)} danger /></Tooltip>
                      </div>
                    </List.Item>
                  )} />
                </div>
                <Button icon={<FontAwesomeIcon icon={faPlus} />} onClick={handleAddClass} block style={{ marginTop: 16 }}>{t.addClass}</Button>
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCog} /></Tooltip>} key="3" disabled={disabledUI}>
              <div className="tab-pane-content">
                <Form layout="vertical">
                  <Title level={5}>{t.viewSettings || 'View & Annotation Settings'}</Title>
                  <Form.Item label={t.category}>
                    <Select value={currentCategory} onChange={(value: string) => setCurrentCategory(value)} disabled={!hasWorkspace || mask_categories.length === 0} placeholder={t.noCategoriesFound}>
                      {mask_categories.map((cat, index) => <Option key={cat} value={cat}> <Space> <div style={{ width: '14px', height: '14px', backgroundColor: mask_categoryColors[cat] || '#ccc', borderRadius: '3px', border: '1px solid #ccc' }} /> {`[${index}] ${cat}`} </Space> </Option>)}
                    </Select>
                  </Form.Item>
                  <Form.Item label={t.lineWidth}><InputNumber min={1} max={50} value={currentLineWidth} onChange={(val) => setCurrentLineWidth(val || 1)} style={{ width: '100%' }} disabled={!hasWorkspace} /></Form.Item>
                  <Form.Item label={t.toggleCategoryInBox} valuePropName="checked"><Switch checked={showCategoryInBox} onChange={setShowCategoryInBox} /></Form.Item>
                  <Divider />
                  <Title level={5}>{t.regionDelete}</Title>
                  <Form.Item label={t.regionDeleteMode}>
                    <Radio.Group onChange={(e: RadioChangeEvent) => setRegionDeleteMode(e.target.value)} value={regionDeleteMode} disabled={!hasWorkspace}>
                      <Radio.Button value="contain">{t.fullyContained}</Radio.Button>
                      <Radio.Button value="intersect">{t.intersecting}</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Divider />
                  <Form.Item><Button danger icon={<FontAwesomeIcon icon={faEraser} />} onClick={handleClearAnnotations} block disabled={!hasWorkspace || localAnnotations.length === 0}>{t.clearAnnotationsButton}</Button></Form.Item>
                </Form>
              </div>
            </TabPane>
          </Tabs>
        </Sider>
      </Layout>
    </Layout>
  );
};

export default MaskOperate;
