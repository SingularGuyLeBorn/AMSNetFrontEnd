// START OF FILE src/pages/MaskOperate/index.tsx
import React, { useState, useRef, useEffect, useCallback, ChangeEvent, useMemo } from "react";
import { useModel } from '@umijs/max';
import { Layout, Button, Select, InputNumber, message, Typography, List, Collapse, Space, Tooltip, Form, Radio, Tabs, Flex, Divider, Input, Switch, Modal, Descriptions } from 'antd';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faChevronLeft, faChevronRight, faUndo, faRedo,
  faDrawPolygon, faTrash, faPaintBrush,
  faCog, faList, faMousePointer, faSave, faEraser, faRobot,
  faFileImport, faFileExport, faPlus, faMinusCircle, faTags, faDatabase
} from "@fortawesome/free-solid-svg-icons";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { RESIZE_HANDLE_SIZE, translations, defaultCategoryColors } from './constants';
import type { ImageAnnotationData, ViewAnnotation, UndoOperation as MaskUndoOperation, ViewBoxAnnotation, ViewDiagonalAnnotation, Point, ApiResponse, ApiKeyPoint, ApiSegment } from './constants';
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;
const { TabPane } = Tabs;
const { Sider, Content, Header } = Layout;

type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete';
type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';
type DraggingState = { type: 'move' | 'resize'; handle?: ResizeHandle; startMousePos: Point; startAnnotationState: ViewAnnotation; } | null;
type ImageDetails = { name: string; url: string; width: number; height: number; originalFile: File; };

const getFileNameWithoutExtension = (fileName: string): string => fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
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

// --- 数据转换模块 ---

/**
 * 将API响应的`key_points`和`segments`部分转换为前端渲染的`ViewDiagonalAnnotation`格式。
 */
const convertApiToView = (apiData: ApiResponse, allCategoryColors: { [key: string]: string }, thickness: number): ViewAnnotation[] => {
    if (!apiData || !apiData.key_points || !apiData.segments) {
        return [];
    }

    const { key_points, segments } = apiData;
    const keyPointMap = new Map(key_points.map(p => [p.id, p]));
    const viewAnnotations: ViewDiagonalAnnotation[] = [];

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
            });
        }
    });
    return viewAnnotations;
};


/**
 * 将前端的ViewAnnotation格式转换为API的kpt/segment格式 (用于导出)。
 */
const convertViewToApi = (viewAnnotations: ViewAnnotation[]): ApiResponse => {
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
        return { key_points: [], segments: [] };
    }

    viewAnnotations.forEach(anno => {
        if ('points' in anno) {
            const srcId = getOrCreateKeyPoint(anno.points[0], anno.category);
            const dstId = getOrCreateKeyPoint(anno.points[1], anno.category);
            segments.push({ src_key_point_id: srcId, dst_key_point_id: dstId });
        } else if ('width' in anno) {
            const p1 = { x: anno.x, y: anno.y };
            const p2 = { x: anno.x + anno.width, y: anno.y };
            const p3 = { x: anno.x + anno.width, y: anno.y + anno.height };
            const p4 = { x: anno.x, y: anno.y + anno.height };

            const id1 = getOrCreateKeyPoint(p1, anno.category);
            const id2 = getOrCreateKeyPoint(p2, anno.category);
            const id3 = getOrCreateKeyPoint(p3, anno.category);
            const id4 = getOrCreateKeyPoint(p4, anno.category);

            segments.push({ src_key_point_id: id1, dst_key_point_id: id2 });
            segments.push({ src_key_point_id: id2, dst_key_point_id: id3 });
            segments.push({ src_key_point_id: id3, dst_key_point_id: id4 });
            segments.push({ src_key_point_id: id4, dst_key_point_id: id1 });
        }
    });

    return { key_points, segments };
};


const MaskOperate = () => {
  const { initialState } = useModel('@@initialState');
  const {
    mask_currentIndex: currentImageIndex, setMask_currentIndex: setCurrentImageIndex,
    mask_allImageAnnotations: allImageAnnotations, setMask_allImageAnnotations: setAllImageAnnotations,
    mask_categories: categories, setMask_categories: setCategories,
    mask_categoryColors: categoryColors, setMask_categoryColors: setCategoryColors,
    mask_selectedAnnotationId: selectedAnnotationId, setMask_selectedAnnotationId: setSelectedAnnotationId,
    mask_operationHistory, setMask_operationHistory,
    mask_redoHistory, setMask_redoHistory,
    file_pngList: images, setFile_pngList: setImages,
  } = useModel('annotationStore');
  
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];
  const [currentImageDetails, setCurrentImageDetails] = useState<ImageDetails | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('diagonal');
  const [currentCategory, setCurrentCategory] = useState<string>(categories[0] || "");
  const [currentLineWidth, setCurrentLineWidth] = useState<number>(2);
  const [showCategoryInBox, setShowCategoryInBox] = useState<boolean>(true);
  const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
  const [inspectorWidth, setInspectorWidth] = useState<number>(350);
  const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
  const [draggingState, setDraggingState] = useState<DraggingState>(null);
  const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isAiAnnotating, setIsAiAnnotating] = useState(false);
  const [isCurrentlyEditingId, setIsCurrentlyEditingId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const classesFileRef = useRef<HTMLInputElement>(null);

  const hasActiveImage = images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length;
  
  const currentAnnotations = useMemo(() => {
    return currentImageDetails ? allImageAnnotations[currentImageDetails.name] : null;
  }, [currentImageDetails, allImageAnnotations]);
  
  const currentViewAnnotations: ViewAnnotation[] = currentAnnotations?.viewAnnotations || [];
  const currentApiJson: ApiResponse = currentAnnotations?.apiJson || { key_points: [], segments: [] };

  const currentUndoStackSize = (mask_operationHistory[currentImageIndex] || []).length;
  const currentRedoStackSize = (mask_redoHistory[currentImageIndex] || []).length;

  const getResizeHandles = (box: ViewBoxAnnotation): {[key in ResizeHandle]: {x: number, y: number, size: number, cursor: string}} => {
    const s = RESIZE_HANDLE_SIZE; const { x, y, width, height } = box;
    return { topLeft: { x: x - s/2, y: y - s/2, size: s, cursor: 'nwse-resize' }, top: { x: x + width/2 - s/2, y: y - s/2, size: s, cursor: 'ns-resize' }, topRight: { x: x + width - s/2, y: y - s/2, size: s, cursor: 'nesw-resize' }, left: { x: x - s/2, y: y + height/2 - s/2, size: s, cursor: 'ew-resize' }, right: { x: x + width - s/2, y: y + height/2 - s/2, size: s, cursor: 'ew-resize' }, bottomLeft: { x: x - s/2, y: y + height - s/2, size: s, cursor: 'nesw-resize' }, bottom: { x: x + width/2 - s/2, y: y + height - s/2, size: s, cursor: 'ns-resize' }, bottomRight:{ x: x + width - s/2, y: y + height - s/2, size: s, cursor: 'nwse-resize' }, };
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
        Object.values(handles).forEach(handle => ctx.fillRect(handle.x, handle.y, handle.size, handle.size));
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
    
    if (currentImageDetails) {
        const img = new Image(); 
        img.crossOrigin = "Anonymous";
        img.src = currentImageDetails.url;
        img.onload = () => {
            canvas.width = currentImageDetails.width; 
            canvas.height = currentImageDetails.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            currentViewAnnotations.forEach((anno: ViewAnnotation) => {
                if (anno.id !== selectedAnnotationId) {
                    if ('points' in anno) renderDiagonal(anno, ctx, false, false);
                    else renderRectangle(anno, ctx, false, false);
                }
            });

            const selectedAnno = currentViewAnnotations.find(a => a.id === selectedAnnotationId);
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
        };
        if(img.complete) img.onload(new Event('load'));
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
  }, [currentImageDetails, currentViewAnnotations, selectedAnnotationId, activeTool, draggingState, canvasMousePos, t.noImages, renderDiagonal, renderRectangle, currentCategory, currentLineWidth]);
  
  const getScaledCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
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

  useEffect(() => { setCurrentLang(initialState?.language || 'zh'); }, [initialState?.language]);

  useEffect(() => {
    if (!hasActiveImage) { setCurrentImageDetails(null); return; }
    const currentImageFile = images[currentImageIndex]; const url = URL.createObjectURL(currentImageFile);
    const img = new Image();
    img.onload = () => { setCurrentImageDetails({ name: currentImageFile.name, url, width: img.naturalWidth, height: img.naturalHeight, originalFile: currentImageFile }); };
    img.src = url;
    return () => { URL.revokeObjectURL(url); };
  }, [currentImageIndex, hasActiveImage, images]);

  useEffect(() => {
    if (categories.length > 0 && (!currentCategory || !categories.includes(currentCategory))) { setCurrentCategory(categories[0]); } 
    else if (categories.length === 0 && currentCategory !== "") { setCurrentCategory(""); }
  }, [categories, currentCategory]);
  
  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);
  
  useEffect(() => { 
    const handleResize = () => redrawCanvas(); 
    window.addEventListener('resize', handleResize); 
    return () => window.removeEventListener('resize', handleResize); 
  }, [redrawCanvas]);

  useEffect(() => {
    const canvasEl = canvasRef.current; if (!canvasEl || !currentImageDetails) return;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      const scaleX = currentImageDetails.width / rect.width; const scaleY = currentImageDetails.height / rect.height;
      setCanvasMousePos({ x: Math.max(0, (e.clientX - rect.left) * scaleX), y: Math.max(0, (e.clientY - rect.top) * scaleY) });
    };
    canvasEl.addEventListener('mousemove', handleMouseMove);
    return () => canvasEl.removeEventListener('mousemove', handleMouseMove);
  }, [currentImageDetails]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { if (!isResizingInspector) return; const newWidth = window.innerWidth - e.clientX; if (newWidth > 200 && newWidth < 800) setInspectorWidth(newWidth); };
    const handleMouseUp = () => setIsResizingInspector(false);
    if (isResizingInspector) { document.body.style.userSelect = 'none'; window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { document.body.style.userSelect = ''; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizingInspector]);
  
  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }): boolean => ( point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height );
  
  const addUndoRecord = useCallback(() => {
    if (!currentImageDetails) return;
    const operation: MaskUndoOperation = { imageId: currentImageDetails.name, previousViewAnnotations: currentViewAnnotations, previousApiJson: currentApiJson };
    setMask_operationHistory(prev => ({...prev, [currentImageIndex]: [...(prev[currentImageIndex] || []), operation]}));
    setMask_redoHistory(prev => ({...prev, [currentImageIndex]: []}));
  }, [currentImageDetails, currentImageIndex, currentViewAnnotations, currentApiJson, setMask_operationHistory, setMask_redoHistory]);

  const updateAnnotations = useCallback((newViewAnnotations: ViewAnnotation[], newApiJson?: ApiResponse) => {
    if (!currentImageDetails) return;
    setAllImageAnnotations(prev => {
      const updatedApiJson = newApiJson || convertViewToApi(newViewAnnotations);
      return { ...prev, [currentImageDetails.name]: { ...prev[currentImageDetails.name], viewAnnotations: newViewAnnotations, apiJson: updatedApiJson }};
    });
  }, [currentImageDetails, setAllImageAnnotations]);
  
  const handleAnnotationPropertyUpdate = useCallback((annoId: string, updates: Partial<ViewAnnotation>) => {
    const newViewAnnotations = currentViewAnnotations.map(a => a.id === annoId ? {...a, ...updates} : a);
    updateAnnotations(newViewAnnotations);
  }, [currentViewAnnotations, updateAnnotations]);

  const handleEditFocus = useCallback((annotationId: string) => {
    if (isCurrentlyEditingId !== annotationId) {
      addUndoRecord();
      setIsCurrentlyEditingId(annotationId);
    }
  }, [isCurrentlyEditingId, addUndoRecord]);

  const addAnnotation = useCallback((newAnnotation: ViewAnnotation) => {
    if (!currentImageDetails) return;
    addUndoRecord();
    updateAnnotations([...currentViewAnnotations, newAnnotation]);
  }, [currentImageDetails, addUndoRecord, updateAnnotations, currentViewAnnotations]);

  const removeAnnotationById = useCallback((idToRemove: string) => {
    if (!currentImageDetails) return;
    addUndoRecord();
    const updatedAnnotations = currentViewAnnotations.filter(a => a.id !== idToRemove);
    updateAnnotations(updatedAnnotations);
    if (selectedAnnotationId === idToRemove) setSelectedAnnotationId(null);
    message.success(`${t.deleteAnnotationTooltip} ${t.operationSuccessful}`);
  }, [currentImageDetails, currentViewAnnotations, addUndoRecord, updateAnnotations, t, selectedAnnotationId, setSelectedAnnotationId]);

  const performUndo = useCallback(() => {
    const history = mask_operationHistory[currentImageIndex] || []; if (history.length === 0 || !currentImageDetails) return;
    const lastOp = history[history.length - 1]; 
    const redoOp: MaskUndoOperation = { imageId: currentImageDetails.name, previousViewAnnotations: currentViewAnnotations, previousApiJson: currentApiJson };
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: [redoOp, ...(prev[currentImageIndex] || [])] }));
    setAllImageAnnotations(prev => ({...prev, [lastOp.imageId]: {...prev[lastOp.imageId], viewAnnotations: lastOp.previousViewAnnotations, apiJson: lastOp.previousApiJson }}));
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: history.slice(0, -1) }));
    message.success(t.operationSuccessful);
  }, [mask_operationHistory, currentImageIndex, currentImageDetails, currentViewAnnotations, currentApiJson, setMask_redoHistory, setAllImageAnnotations, setMask_operationHistory, t.operationSuccessful]);

  const performRedo = useCallback(() => {
    const history = mask_redoHistory[currentImageIndex] || []; if (history.length === 0 || !currentImageDetails) return;
    const redoOp = history[0]; 
    const undoOp: MaskUndoOperation = { imageId: currentImageDetails.name, previousViewAnnotations: currentViewAnnotations, previousApiJson: currentApiJson };
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: [...(prev[currentImageIndex] || []), undoOp] }));
    setAllImageAnnotations(prev => ({...prev, [redoOp.imageId]: {...prev[redoOp.imageId], viewAnnotations: redoOp.previousViewAnnotations, apiJson: redoOp.previousApiJson }}));
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: history.slice(1) }));
    message.success(t.operationSuccessful);
  }, [mask_redoHistory, currentImageIndex, currentImageDetails, currentViewAnnotations, currentApiJson, setMask_operationHistory, setAllImageAnnotations, setMask_redoHistory, t.operationSuccessful]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageDetails || !canvasRef.current) return;
    const mousePos = getScaledCoords(e);
    if (activeTool === 'select') {
      const selectedAnno = currentViewAnnotations.find(a => a.id === selectedAnnotationId);
      if (selectedAnno && 'width' in selectedAnno) {
        const handles = getResizeHandles(selectedAnno);
        for(const handleKey of Object.keys(handles) as ResizeHandle[]) {
          const handle = handles[handleKey]; if(isPointInRect(mousePos, {x: handle.x, y: handle.y, width: handle.size, height: handle.size})) {
            addUndoRecord(); setDraggingState({ type: 'resize', handle: handleKey, startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
          }
        }
      }
      const clickedAnnotation = [...currentViewAnnotations].reverse().find((anno: ViewAnnotation) => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points); const translatedX = mousePos.x - centerX; const translatedY = mousePos.y - centerY; const rotatedX = translatedX * Math.cos(-angleRad) - translatedY * Math.sin(-angleRad); const rotatedY = translatedX * Math.sin(-angleRad) + translatedY * Math.cos(-angleRad);
          return Math.abs(rotatedX) <= length / 2 && Math.abs(rotatedY) <= anno.thickness / 2;
        } else return isPointInRect(mousePos, anno);
      });
      if (clickedAnnotation) {
        if (selectedAnnotationId !== clickedAnnotation.id) { 
          setSelectedAnnotationId(clickedAnnotation.id); 
        } else { 
          addUndoRecord(); 
          setDraggingState({ type: 'move', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(clickedAnnotation)) }); 
        }
      } else {
        setSelectedAnnotationId(null);
      }
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      if (!currentCategory) { message.warning(t.noCategoriesFound); return; }
      setDraggingState({ type: 'move', startMousePos: mousePos, startAnnotationState: {} as any });
    }
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState || !currentImageDetails) return;
    const mousePos = getScaledCoords(e); 
    if (activeTool === 'select' && draggingState.startAnnotationState.id) {
      const dx = mousePos.x - draggingState.startMousePos.x; const dy = mousePos.y - draggingState.startMousePos.y;
      const startState = draggingState.startAnnotationState;
      const updatedAnnos = currentViewAnnotations.map(anno => {
        if(anno.id === startState.id) {
            let newAnno: ViewAnnotation = JSON.parse(JSON.stringify(anno));
            if (draggingState.type === 'move') {
                if ('points' in newAnno && 'points' in startState) {
                  newAnno.points[0] = { x: startState.points[0].x + dx, y: startState.points[0].y + dy };
                  newAnno.points[1] = { x: startState.points[1].x + dx, y: startState.points[1].y + dy };
                } else if ('x' in newAnno && 'x' in startState) { newAnno.x = startState.x + dx; newAnno.y = startState.y + dy; }
              } else if (draggingState.type === 'resize' && draggingState.handle && 'width' in newAnno && 'width' in startState) {
                const { handle } = draggingState; const startBox = startState;
                if (handle.includes('right')) newAnno.width = Math.max(1, startBox.width + dx);
                if (handle.includes('left')) { newAnno.x = startBox.x + dx; newAnno.width = Math.max(1, startBox.width - dx); }
                if (handle.includes('bottom')) newAnno.height = Math.max(1, startBox.height + dy);
                if (handle.includes('top')) { newAnno.y = startBox.y + dy; newAnno.height = Math.max(1, startBox.height - dy); }
            }
            return newAnno;
        }
        return anno;
      });
      updateAnnotations(updatedAnnos);
    }
    setCanvasMousePos(mousePos);
  };
  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState) return;
    if (activeTool === 'rectangle' || activeTool === 'diagonal') {
        const start = draggingState.startMousePos; 
        const end = getScaledCoords(e);
        const color = categoryColors[currentCategory] || '#cccccc';
        if (activeTool === 'rectangle') {
            const width = Math.abs(start.x - end.x); const height = Math.abs(start.y - end.y);
            if(width > 2 && height > 2) {
                const newRect: ViewBoxAnnotation = { id: generateUniqueId(), x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height, category: currentCategory, color, sourceLineWidth: currentLineWidth };
                addAnnotation(newRect);
            }
        } else if (activeTool === 'diagonal') {
            const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            if(length > 2) {
                const newDiag: ViewDiagonalAnnotation = { id: generateUniqueId(), points: [start, end], category: currentCategory, color, thickness: currentLineWidth };
                addAnnotation(newDiag);
            }
        }
    }
    setDraggingState(null);
  };
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageDetails || draggingState) return;
    const clickPos = getScaledCoords(e);

    if (activeTool === 'delete') {
      const annoToDelete = [...currentViewAnnotations].reverse().find((anno: ViewAnnotation) => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points);
          const t_mousePos = {x: clickPos.x - centerX, y: clickPos.y - centerY};
          const r_mousePos = {x: t_mousePos.x * Math.cos(-angleRad) - t_mousePos.y * Math.sin(-angleRad), y: t_mousePos.x * Math.sin(-angleRad) + t_mousePos.y * Math.cos(-angleRad)};
          return Math.abs(r_mousePos.x) <= length/2 && Math.abs(r_mousePos.y) <= anno.thickness/2;
        } else return isPointInRect(clickPos, anno);
      });
      if(annoToDelete) removeAnnotationById(annoToDelete.id);
    }
  };

  const processUploadedFiles = async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles) return;
    message.loading({ content: t.uploadFolder, key: 'fileProcessing', duration: 0 });
    const filesArray = Array.from(uploadedFiles);
    
    let tempCats = [...categories];
    let tempColors = { ...categoryColors };

    const imageFiles = filesArray.filter(f => f.type.startsWith('image/'));
    const jsonFiles = filesArray.filter(f => f.name.endsWith('.json'));
    const sortedImageFiles = imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    const newAnnotations: {[imageName: string]: ImageAnnotationData} = {};

    for(const imgFile of sortedImageFiles) {
        const baseName = getFileNameWithoutExtension(imgFile.name);
        const jsonFile = jsonFiles.find(f => getFileNameWithoutExtension(f.name) === baseName);
        let apiJson: ApiResponse = {};

        if(jsonFile) {
            try {
                apiJson = JSON.parse(await jsonFile.text());
                const viewAnnotations = convertApiToView(apiJson, tempColors, currentLineWidth);
                
                const newCats = [...new Set(viewAnnotations.map(va => va.category))];
                newCats.forEach(cat => {
                    if (cat && !tempCats.includes(cat)) {
                        tempCats.push(cat);
                        tempColors[cat] = rgbaToHex(Object.values(defaultCategoryColors)[tempCats.length % Object.keys(defaultCategoryColors).length]);
                    }
                });

            } catch(e) { 
                message.error(`${t.errorParseJsonFile} ${jsonFile.name}: ${e instanceof Error ? e.message : String(e)}`);
                apiJson = {};
            }
        }
        
        const viewAnnotations = convertApiToView(apiJson, tempColors, currentLineWidth);
        newAnnotations[imgFile.name] = { viewAnnotations, apiJson };
    }
    setCategories(tempCats); 
    setCategoryColors(tempColors);
    setImages(sortedImageFiles);
    setAllImageAnnotations(newAnnotations); 
    setCurrentImageIndex(sortedImageFiles.length > 0 ? 0 : -1);
    setMask_operationHistory({}); setMask_redoHistory({});
    message.success({content: `${sortedImageFiles.length} ${t.filesProcessed} ${t.fileProcessingComplete}`, key: 'fileProcessing', duration: 3});
    if(folderUploadRef.current) folderUploadRef.current.value = "";
  };
  
  const navigateImage = (offset: number) => { const newIndex = currentImageIndex + offset; if (newIndex >= 0 && newIndex < images.length) { setCurrentImageIndex(newIndex); setSelectedAnnotationId(null); setDraggingState(null); } };
  
  const handleExportAll = async () => {
    if(images.length === 0) return;
    message.loading({ content: t.exportingMessage, key: 'exporting', duration: 0 });
    try {
        const zip = new JSZip();
        zip.file("classes.txt", categories.join('\n'));
        
        for (const imageFile of images) {
            zip.file(`images/${imageFile.name}`, imageFile);
            const imageName = imageFile.name;
            const annotationsForImage = allImageAnnotations[imageName] || { viewAnnotations: [], apiJson: {} };
            
            const jsonContent = JSON.stringify(annotationsForImage.apiJson, null, 2);

            const baseName = getFileNameWithoutExtension(imageName);
            zip.file(`json/${baseName}.json`, jsonContent);
        }
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "maskoperate_annotations.zip");
        message.success({ content: t.exportSuccessMessage, key: 'exporting', duration: 3 });
    } catch (error: any) { 
        console.error("Export failed:", error); 
        message.error({ content: `${t.exportFailureMessage} ${error.message}`, key: 'exporting', duration: 3 }); 
    }
  };
  
  const handleAiAnnotation = async () => {
    if (!currentImageDetails) { message.warning(t.noImages); return; }
    
    setIsAiAnnotating(true);
    message.loading({ content: t.aiAnnotating, key: 'ai-annotation', duration: 0 });

    try {
        const formData = new FormData();
        formData.append('file', currentImageDetails.originalFile, currentImageDetails.originalFile.name);

        const response = await fetch('http://127.0.0.1:8100/process/', {
            method: 'POST',
            body: formData
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
        const apiResult: ApiResponse = await response.json();

        if (!apiResult || !apiResult.key_points || !apiResult.segments) {
            message.info({ content: "AI 未返回任何有效的连线标注。", key: 'ai-annotation', duration: 3 });
            setIsAiAnnotating(false);
            return;
        }

        const newViewAnnotations = convertApiToView(apiResult, categoryColors, currentLineWidth);

        const newCatNames = [...new Set(newViewAnnotations.map(a => a.category))];
        const newlyDiscoveredCats = newCatNames.filter(name => !categories.includes(name));
        let updatedCategoryColors = { ...categoryColors };
        if (newlyDiscoveredCats.length > 0) {
            const newCategories = [...categories, ...newlyDiscoveredCats];
            newlyDiscoveredCats.forEach((cat) => {
                if(!updatedCategoryColors[cat]){
                    const colorPool = Object.values(defaultCategoryColors);
                    updatedCategoryColors[cat] = rgbaToHex(colorPool[newCategories.indexOf(cat) % colorPool.length]);
                }
            });
            setCategories(newCategories);
            setCategoryColors(updatedCategoryColors);
        }
        
        const finalViewAnnotations = convertApiToView(apiResult, updatedCategoryColors, currentLineWidth);

        addUndoRecord();
        updateAnnotations(finalViewAnnotations, apiResult);
        message.success({ content: `${t.operationSuccessful}: ${finalViewAnnotations.length} annotations loaded.`, key: 'ai-annotation', duration: 3 });

    } catch (error: any) {
        console.error("AI Annotation failed:", error);
        message.error({ content: `${t.aiFailed}: ${error.message}`, key: 'ai-annotation', duration: 5 });
    } finally {
        setIsAiAnnotating(false);
    }
  };

  const handleAddClass = () => {
    const newClassName = `new_class_${categories.filter(c => c.startsWith('new_class')).length}`; if(categories.includes(newClassName)) return;
    const newCategories = [...categories, newClassName];
    const newColor = Object.values(defaultCategoryColors)[newCategories.length % Object.keys(defaultCategoryColors).length];
    const newCategoryColors = {...categoryColors, [newClassName]: rgbaToHex(newColor)};
    setCategories(newCategories); setCategoryColors(newCategoryColors); setCurrentCategory(newClassName);
  };
  const handleUpdateClass = (oldName: string, newName: string) => {
    if(newName === oldName || newName.trim() === '' || categories.includes(newName)) return;
    const newNameTrimmed = newName.trim();
    setCategories(prev => prev.map(c => c === oldName ? newNameTrimmed : c));
    setCategoryColors(prev => { const newColors = {...prev}; newColors[newNameTrimmed] = newColors[oldName]; delete newColors[oldName]; return newColors; });
    
    const newAllAnnos = {...allImageAnnotations};
    Object.keys(newAllAnnos).forEach(imgName => {
        const updatedViewAnnos = newAllAnnos[imgName].viewAnnotations.map(anno => anno.category === oldName ? {...anno, category: newNameTrimmed} : anno);
        newAllAnnos[imgName] = { ...newAllAnnos[imgName], viewAnnotations: updatedViewAnnos };
    });
    setAllImageAnnotations(newAllAnnos);

    if (currentCategory === oldName) setCurrentCategory(newNameTrimmed);
  };
  const handleUpdateColor = (catName: string, newColor: string) => {
    setCategoryColors(prev => ({...prev, [catName]: newColor}));
    const newAllAnnos = {...allImageAnnotations};
    Object.keys(newAllAnnos).forEach(imgName => { 
        const updatedViewAnnos = newAllAnnos[imgName].viewAnnotations.map(anno => anno.category === catName ? {...anno, color: newColor} : anno);
        newAllAnnos[imgName] = { ...newAllAnnos[imgName], viewAnnotations: updatedViewAnnos };
    });
    setAllImageAnnotations(newAllAnnos);
  };
  const handleDeleteClass = (className: string) => {
    const title = t.deleteClassConfirmTitle ? t.deleteClassConfirmTitle.replace('%s', className) : `确认删除类别 ${className}?`;
    Modal.confirm({ 
        title: title, 
        content: t.deleteClassConfirmContent, okText: t.confirmDelete, okType: 'danger', cancelText: t.cancel,
        onOk: () => {
            const newCategories = categories.filter(c => c !== className);
            const newCategoryColors = { ...categoryColors };
            delete newCategoryColors[className];
            const newAllAnnotations = { ...allImageAnnotations };
            Object.keys(newAllAnnotations).forEach(imgName => {
                const filteredViewAnnos = newAllAnnotations[imgName].viewAnnotations.filter(anno => anno.category !== className);
                newAllAnnotations[imgName] = { ...newAllAnnotations[imgName], viewAnnotations: filteredViewAnnos, apiJson: convertViewToApi(filteredViewAnnos) };
            });
            setCategories(newCategories);
            setCategoryColors(newCategoryColors);
            setAllImageAnnotations(newAllAnnotations);
            if (currentCategory === className) setCurrentCategory(newCategories[0] || "");
            message.success(t.classDeleted.replace('%s', className));
        }
    });
  };
  const handleExportClasses = () => saveAs(new Blob([categories.join('\n')], {type: "text/plain;charset=utf-8"}), "classes.txt");
  const handleImportClasses = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return; const text = await file.text();
    const newCats = text.split('\n').map(l => l.trim()).filter(Boolean); const newColors: {[key: string]: string} = {};
    const updatedDefaultColors = Object.entries(defaultCategoryColors).reduce((acc, [key, value]) => { acc[key] = rgbaToHex(value); return acc; }, {} as {[key: string]: string});
    newCats.forEach((cat, i) => { newColors[cat] = categoryColors[cat] || updatedDefaultColors[cat] || Object.values(updatedDefaultColors)[i % Object.keys(updatedDefaultColors).length] });
    setCategories(newCats); setCategoryColors(newColors); if(newCats.length > 0) setCurrentCategory(newCats[0]);
    message.success(`${newCats.length} ${t.category.toLowerCase()}(s) imported.`);
    if(classesFileRef.current) classesFileRef.current.value = "";
  };
  const handleClearAnnotations = () => {
    if (!currentImageDetails || currentViewAnnotations.length === 0) return;
    addUndoRecord();
    updateAnnotations([]);
    setSelectedAnnotationId(null); message.success(t.clearAnnotationsButton + ' ' + t.operationSuccessful);
  };

  const isSelectedForEdit = (item: ViewAnnotation) => activeTool === 'select' && item.id === selectedAnnotationId;

  return (
    <Layout className="unified-layout">
        <Header className="unified-top-header">
            <div className="header-left-controls">
                <Button type="primary" icon={<FontAwesomeIcon icon={faUpload} />} onClick={() => folderUploadRef.current?.click()}>{t.uploadFolder}</Button>
                <input ref={folderUploadRef} type="file" {...{webkitdirectory:"true", directory:"true"} as any} multiple onChange={(e: ChangeEvent<HTMLInputElement>) => processUploadedFiles(e.target.files)} style={{ display: 'none' }}/>
            </div>
            <Space className="header-center-controls">
                <Button icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => navigateImage(-1)} disabled={!hasActiveImage || currentImageIndex === 0} />
                <Text className="current-file-text" title={currentImageDetails?.name}>{currentImageDetails ? `${t.currentImage}: ${currentImageDetails.name} (${currentImageIndex + 1}/${images.length})` : t.noImages}</Text>
                <Button icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => navigateImage(1)} disabled={!hasActiveImage || currentImageIndex >= images.length - 1} />
            </Space>
            <div className="header-right-controls">
                <Tooltip title={t.undo}><Button icon={<FontAwesomeIcon icon={faUndo} />} onClick={performUndo} disabled={currentUndoStackSize === 0} /></Tooltip>
                <Tooltip title={t.redo}><Button icon={<FontAwesomeIcon icon={faRedo} />} onClick={performRedo} disabled={currentRedoStackSize === 0} /></Tooltip>
                <Button type="primary" icon={<FontAwesomeIcon icon={faSave} />} onClick={handleExportAll} ghost disabled={images.length === 0}>{t.exportAll}</Button>
            </div>
        </Header>
        <Layout hasSider>
            <Sider width={60} className="unified-tool-sider" theme="light">
                <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: '16px' }}>
                    <Tooltip title={t.selectTool} placement="right"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={!hasActiveImage} /></Tooltip>
                    <Tooltip title={t.rectTool} placement="right"><Button onClick={() => setActiveTool('rectangle')} type={activeTool === 'rectangle' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={!hasActiveImage} /></Tooltip>
                    <Tooltip title={t.diagonalTool} placement="right"><Button onClick={() => setActiveTool('diagonal')} type={activeTool === 'diagonal' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faDrawPolygon} />} disabled={!hasActiveImage} /></Tooltip>
                    <Tooltip title={t.deleteTool} placement="right"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} className="tool-button" icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={!hasActiveImage} /></Tooltip>
                    <Divider style={{margin: '8px 0'}}/>
                    <Tooltip title={t.aiAnnotate} placement="right"><Button onClick={handleAiAnnotation} type="text" className="tool-button" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!hasActiveImage || isAiAnnotating} /></Tooltip>
                </Space>
            </Sider>
            <Layout className="main-content-wrapper">
                <Content className="canvas-content">
                    <div className={`canvas-wrapper ${activeTool === 'delete' ? 'delete-cursor' : (activeTool === 'select' ? '' : 'draw-cursor')}`}>
                        <canvas ref={canvasRef} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onClick={handleCanvasClick}/>
                    </div>
                </Content>
                {!isInspectorVisible && (<Tooltip title={t.showPanel} placement="left"><Button className="show-inspector-handle" type="primary" icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => setIsInspectorVisible(true)} /></Tooltip>)}
            </Layout>
            <div className="resizer-horizontal" onMouseDown={() => setIsResizingInspector(true)} style={{ display: isInspectorVisible ? 'flex' : 'none', cursor: 'ew-resize' }} />
            <Sider width={isInspectorVisible ? inspectorWidth : 0} className="unified-inspector-sider" theme="light" collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
                <Tabs defaultActiveKey="1" className="inspector-tabs" tabBarExtraContent={<Tooltip title={t.hidePanel}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(false)} /></Tooltip>}>
                    <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="1">
                        <div className="tab-pane-content">
                        {hasActiveImage && currentViewAnnotations.length > 0 ? (
                            <div className="annotation-collapse-container">
                                <Collapse accordion activeKey={selectedAnnotationId || undefined} onChange={(key) => { const newKey = Array.isArray(key) ? key[0] : (typeof key === 'string' ? key : null); setSelectedAnnotationId(newKey); setIsCurrentlyEditingId(null); }} ghost>
                                {currentViewAnnotations.map((item) => (
                                    <Panel key={item.id} className="annotation-panel-item" header={
                                    <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                                        <Space onClick={(e) => e.stopPropagation()}>
                                        <div className="color-indicator" style={{ backgroundColor: item.color }} />
                                        <Text className="category-name-text" title={item.category} ellipsis>{item.category}</Text>
                                        </Space>
                                        <Tooltip title={t.deleteAnnotationTooltip}><Button size="small" type="text" danger icon={<FontAwesomeIcon icon={faTrash}/>} onClick={(e) => { e.stopPropagation(); removeAnnotationById(item.id); }} /></Tooltip>
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
                                            <Descriptions.Item label="P1.X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[0].x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [{...item.points[0], x: v || 0}, item.points[1]] })} /> : item.points[0].x.toFixed(1)}</Descriptions.Item>
                                            <Descriptions.Item label="P1.Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[0].y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [{...item.points[0], y: v || 0}, item.points[1]] })} /> : item.points[0].y.toFixed(1)}</Descriptions.Item>
                                            <Descriptions.Item label="P2.X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[1].x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [item.points[0], {...item.points[1], x: v || 0}] })} /> : item.points[1].x.toFixed(1)}</Descriptions.Item>
                                            <Descriptions.Item label="P2.Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={item.points[1].y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [item.points[0], {...item.points[1], y: v || 0}] })} /> : item.points[1].y.toFixed(1)}</Descriptions.Item>
                                            <Descriptions.Item label={t.thicknessLabel}>{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={item.thickness} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { thickness: v || 1 })} /> : item.thickness}</Descriptions.Item>
                                        </>
                                        )}
                                    </Descriptions>
                                    </Panel>
                                ))}
                                </Collapse>
                            </div>
                        ) : <Text type="secondary" style={{textAlign: 'center', display: 'block', paddingTop: '20px'}}>{hasActiveImage ? t.noAnnotations : t.noImages}</Text>}
                        </div>
                    </TabPane>
                    <TabPane tab={<Tooltip title={t.rawData} placement="bottom"><FontAwesomeIcon icon={faDatabase} /></Tooltip>} key="4">
                        <div className="tab-pane-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <textarea
                                className="data-content-textarea"
                                readOnly
                                value={JSON.stringify(currentApiJson, null, 2)}
                                style={{ flex: 1, minHeight: 0 }}
                            />
                        </div>
                    </TabPane>
                    <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2">
                        <div className="tab-pane-content">
                            <Flex justify="space-between" align="center" style={{marginBottom: 16}}>
                                <Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title>
                                <Space.Compact>
                                    <Tooltip title={t.importClasses}><Button icon={<FontAwesomeIcon icon={faFileImport}/>} onClick={() => classesFileRef.current?.click()}/></Tooltip>
                                    <Tooltip title={t.exportClasses}><Button icon={<FontAwesomeIcon icon={faFileExport}/>} onClick={handleExportClasses}/></Tooltip>
                                </Space.Compact>
                            </Flex>
                            <input ref={classesFileRef} type="file" accept=".txt" onChange={handleImportClasses} style={{display:'none'}}/>
                            <div className="class-list-container">
                                <List size="small" dataSource={categories} renderItem={(cat: string) => (
                                    <List.Item>
                                        <div className="class-management-item">
                                            <input type="color" value={categoryColors[cat] || '#cccccc'} onChange={(e: ChangeEvent<HTMLInputElement>) => handleUpdateColor(cat, e.target.value)} className="color-picker-input"/>
                                            <Input defaultValue={cat} onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => handleUpdateClass(cat, e.currentTarget.value)} onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleUpdateClass(cat, e.currentTarget.value)} placeholder={t.className} />
                                            <Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle}/>} onClick={() => handleDeleteClass(cat)} danger/></Tooltip>
                                        </div>
                                    </List.Item>
                                )} />
                            </div>
                            <Button icon={<FontAwesomeIcon icon={faPlus}/>} onClick={handleAddClass} block style={{marginTop: 16}}>{t.addClass}</Button>
                        </div>
                    </TabPane>
                    <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCog} /></Tooltip>} key="3">
                        <div className="tab-pane-content">
                            <Form layout="vertical">
                                <Title level={5}>{t.viewSettings || 'View & Annotation Settings'}</Title>
                                <Form.Item label={t.category}>
                                  <Select 
                                      value={currentCategory} 
                                      onChange={(value: string) => setCurrentCategory(value)} 
                                      disabled={!hasActiveImage || categories.length === 0} 
                                      placeholder={t.noCategoriesFound}
                                  >
                                      {categories.map(cat => 
                                          <Option key={cat} value={cat}>
                                              <Space>
                                                  <div style={{ width: '14px', height: '14px', backgroundColor: categoryColors[cat] || '#ccc', borderRadius: '3px', border: '1px solid #ccc' }} />
                                                  {cat}
                                              </Space>
                                          </Option>
                                      )}
                                  </Select>
                                </Form.Item>
                                <Form.Item label={t.lineWidth}><InputNumber min={1} max={50} value={currentLineWidth} onChange={(val) => setCurrentLineWidth(val || 1)} style={{ width: '100%' }} disabled={!hasActiveImage} /></Form.Item>
                                <Form.Item label={t.toggleCategoryInBox} valuePropName="checked"><Switch checked={showCategoryInBox} onChange={setShowCategoryInBox} /></Form.Item>
                                <Form.Item><Button danger icon={<FontAwesomeIcon icon={faEraser} />} onClick={handleClearAnnotations} block disabled={!hasActiveImage || currentViewAnnotations.length === 0}>{t.clearAnnotationsButton}</Button></Form.Item>
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
// END OF FILE src/pages/MaskOperate/index.tsx