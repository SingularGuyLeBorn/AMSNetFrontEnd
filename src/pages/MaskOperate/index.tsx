import React, { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import { useModel } from '@umijs/max';
import { Layout, Button, Select, InputNumber, message, Typography, List, Collapse, Space, Tooltip, Form, Radio, Tabs, Flex, Divider, Input, Switch, Modal, Descriptions } from 'antd';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faChevronLeft, faChevronRight, faUndo, faRedo,
  faDrawPolygon, faTrash, faPaintBrush,
  faCog, faList, faMousePointer, faFileArchive, faEraser, faEye, faEyeSlash, faRobot,
  faFileImport, faFileExport, faPlus, faMinusCircle, faTags
} from "@fortawesome/free-solid-svg-icons";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { RESIZE_HANDLE_SIZE, translations, defaultCategoryColors } from './constants';
import type { ImageAnnotationData, ViewAnnotation, UndoOperation as MaskUndoOperation, ViewBoxAnnotation, ViewDiagonalAnnotation } from './constants';
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;
const { TabPane } = Tabs;
const { Sider, Content, Header } = Layout;

// 本地专用类型
type Point = { x: number; y: number };
type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete';
type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';
type DraggingState = { type: 'move' | 'resize'; handle?: ResizeHandle; startMousePos: Point; startAnnotationState: ViewAnnotation; } | null;
type AiApiType = 'initialDetection' | 'optimization';
type ImageDetails = { name: string; url: string; width: number; height: number; };

// 辅助函数
const getFileNameWithoutExtension = (fileName: string): string => fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
const generateUniqueId = (): string => `anno_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const rgbaToHex = (rgba: string): string => {
  if (rgba.startsWith('#')) return rgba; // Already hex
  const parts = rgba.match(/(\d+)/g);
  if (!parts || parts.length < 3) return '#000000'; // Fallback for invalid format
  const r = parseInt(parts[0], 10);
  const g = parseInt(parts[1], 10);
  const b = parseInt(parts[2], 10);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
};

const MaskOperate = () => {
  const { initialState } = useModel('@@initialState');
  const {
    // 共享状态
    file_pngList: images, setFile_pngList: setImages,
    file_currentIndex: currentImageIndex, setFile_currentIndex: setCurrentImageIndex,

    // MaskOperate 专属状态
    mask_allImageAnnotations: allImageAnnotations, setMask_allImageAnnotations: setAllImageAnnotations,
    mask_categories: categories, setMask_categories: setCategories,
    mask_categoryColors: categoryColors, setMask_categoryColors: setCategoryColors,
    mask_selectedAnnotationId: selectedAnnotationId, setMask_selectedAnnotationId: setSelectedAnnotationId,
    mask_operationHistory, setMask_operationHistory,
    mask_redoHistory, setMask_redoHistory,
  } = useModel('annotationStore');
  
  // 本地UI与工具状态
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];
  const [currentImageDetails, setCurrentImageDetails] = useState<ImageDetails | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('rectangle');
  const [currentCategory, setCurrentCategory] = useState<string>(categories[0] || "");
  const [currentLineWidth, setCurrentLineWidth] = useState<number>(5);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [showCategoryInBox, setShowCategoryInBox] = useState<boolean>(true);
  const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
  const [inspectorWidth, setInspectorWidth] = useState<number>(320);
  const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
  const [draggingState, setDraggingState] = useState<DraggingState>(null);
  const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isAiAnnotating, setIsAiAnnotating] = useState(false);
  const [aiMode, setAiMode] = useState<'auto' | 'manual'>('auto');
  const [manualAiEndpoint, setManualAiEndpoint] = useState<AiApiType>('initialDetection');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const classesFileRef = useRef<HTMLInputElement>(null);

  // 派生状态
  const hasActiveImage = images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length;
  const currentJsonAnnotations: ViewAnnotation[] = (currentImageDetails && allImageAnnotations[currentImageDetails.name]?.jsonAnnotations) || [];
  const activeViewAnnotations: ViewAnnotation[] = showAnnotations ? currentJsonAnnotations : [];
  const currentUndoStackSize = (mask_operationHistory[currentImageIndex] || []).length;
  const currentRedoStackSize = (mask_redoHistory[currentImageIndex] || []).length;

  // Effects
  // 【关键修复】添加此useEffect来监听全局语言变化
  useEffect(() => {
    setCurrentLang(initialState?.language || 'zh');
  }, [initialState?.language]);

  useEffect(() => {
    if (!hasActiveImage) {
      setCurrentImageDetails(null);
      return;
    }
    const currentImageFile = images[currentImageIndex];
    const url = URL.createObjectURL(currentImageFile);
    const img = new Image();
    img.onload = () => { setCurrentImageDetails({ name: currentImageFile.name, url, width: img.naturalWidth, height: img.naturalHeight }); };
    img.src = url;
    return () => { URL.revokeObjectURL(url); };
  }, [currentImageIndex, hasActiveImage, images]);

  useEffect(() => {
    if (categories.length > 0 && (!currentCategory || !categories.includes(currentCategory))) {
      setCurrentCategory(categories[0]);
    } else if (categories.length === 0 && currentCategory !== "") {
      setCurrentCategory("");
    }
  }, [categories, currentCategory]);
  
  useEffect(() => { redrawCanvas(); }, [currentImageDetails, activeViewAnnotations, selectedAnnotationId, showCategoryInBox, activeTool, draggingState, canvasMousePos, t]); // 添加 t 到依赖项，确保语言切换后画布文本也更新

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl || !currentImageDetails) return;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      const scaleX = currentImageDetails.width / rect.width;
      const scaleY = currentImageDetails.height / rect.height;
      setCanvasMousePos({ x: Math.max(0, (e.clientX - rect.left) * scaleX), y: Math.max(0, (e.clientY - rect.top) * scaleY) });
    };
    canvasEl.addEventListener('mousemove', handleMouseMove);
    return () => canvasEl.removeEventListener('mousemove', handleMouseMove);
  }, [currentImageDetails]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingInspector) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) setInspectorWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizingInspector(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizingInspector]);

  // 渲染函数
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
  
    if (currentImageDetails) {
        const img = new Image();
        img.src = currentImageDetails.url;
        img.onload = () => {
            canvas.width = currentImageDetails.width;
            canvas.height = currentImageDetails.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            activeViewAnnotations.forEach((anno: ViewAnnotation) => {
                const isSelected = anno.id === selectedAnnotationId;
                ctx.globalAlpha = isSelected ? 1.0 : 0.75;
                if ('points' in anno) renderDiagonal(anno, ctx, false, isSelected);
                else renderRectangle(anno, ctx, false, isSelected);
            });
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
            ctx.globalAlpha = 1.0;
        };
        if(img.complete) img.onload(new Event('load'));
    } else {
        const { offsetWidth, offsetHeight } = canvas;
        canvas.width = offsetWidth > 0 ? offsetWidth : 800;
        canvas.height = offsetHeight > 0 ? offsetHeight : 600;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#F0F5FF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#0D1A2E";
        ctx.textAlign = "center";
        ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
    }
  }, [currentImageDetails, activeViewAnnotations, selectedAnnotationId, showCategoryInBox, activeTool, draggingState, canvasMousePos, t.noImages]);
  
  const renderRectangle = (box: ViewBoxAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    if (isPreview) {
      ctx.save();
      ctx.setLineDash([8, 4]); ctx.strokeStyle = "#4A90E2"; ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();
      return;
    }
    const color = isSelected ? '#4A90E2' : box.color;
    ctx.fillStyle = color; ctx.strokeStyle = isSelected ? "#357ABD" : "rgba(0,0,0,0.8)";
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    if (showCategoryInBox) {
      ctx.fillStyle = "black"; ctx.font = "bold 12px Arial"; ctx.textBaseline = "top";
      ctx.fillText(box.category, box.x + 4, box.y + 4, box.width - 8);
    }
    if (isSelected) {
      const handles = getResizeHandles(box);
      ctx.fillStyle = '#357ABD';
      Object.values(handles).forEach(handle => ctx.fillRect(handle.x, handle.y, handle.size, handle.size));
    }
  };
  
  const renderDiagonal = (diag: ViewDiagonalAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    const { angleRad, length, centerX, centerY } = getDiagonalParameters(diag.points);
    if (length === 0) return;
    ctx.save();
    ctx.translate(centerX, centerY); ctx.rotate(angleRad);
    ctx.beginPath(); ctx.rect(-length / 2, -diag.thickness / 2, length, diag.thickness);
    if (isPreview) {
      ctx.setLineDash([8, 4]); ctx.strokeStyle = "#4A90E2"; ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const color = isSelected ? '#4A90E2' : diag.color;
      ctx.fillStyle = color; ctx.strokeStyle = isSelected ? "#357ABD" : "rgba(0,0,0,0.6)";
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    if (showCategoryInBox) {
      ctx.fillStyle = "black"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(diag.category, centerX, centerY - diag.thickness / 2 - 5);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }
  };

  const getResizeHandles = (box: ViewBoxAnnotation): {[key in ResizeHandle]: {x: number, y: number, size: number, cursor: string}} => {
    const s = RESIZE_HANDLE_SIZE; const { x, y, width, height } = box;
    return { topLeft: { x: x - s/2, y: y - s/2, size: s, cursor: 'nwse-resize' }, top: { x: x + width/2 - s/2, y: y - s/2, size: s, cursor: 'ns-resize' }, topRight: { x: x + width - s/2, y: y - s/2, size: s, cursor: 'nesw-resize' }, left: { x: x - s/2, y: y + height/2 - s/2, size: s, cursor: 'ew-resize' }, right: { x: x + width - s/2, y: y + height/2 - s/2, size: s, cursor: 'ew-resize' }, bottomLeft: { x: x - s/2, y: y + height - s/2, size: s, cursor: 'nesw-resize' }, bottom: { x: x + width/2 - s/2, y: y + height - s/2, size: s, cursor: 'ns-resize' }, bottomRight:{ x: x + width - s/2, y: y + height - s/2, size: s, cursor: 'nwse-resize' }, };
  };
  
  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }): boolean => ( point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height );
  const getDiagonalParameters = (points: [Point, Point]) => { const dx = points[1].x - points[0].x; const dy = points[1].y - points[0].y; return { angleRad: Math.atan2(dy, dx), length: Math.sqrt(dx * dx + dy * dy), centerX: (points[0].x + points[1].x) / 2, centerY: (points[0].y + points[1].y) / 2, }; };

  // 历史与标注操作
  const addUndoRecord = useCallback(() => {
    if (!currentImageDetails) return;
    const operation: MaskUndoOperation = { imageId: currentImageDetails.name, previousJsonAnnotations: JSON.parse(JSON.stringify(currentJsonAnnotations)) };
    setMask_operationHistory(prev => {
        const newHistory = { ...prev };
        newHistory[currentImageIndex] = [...(prev[currentImageIndex] || []), operation];
        return newHistory;
    });
    setMask_redoHistory(prev => {
        const newHistory = { ...prev };
        newHistory[currentImageIndex] = [];
        return newHistory;
    });
  }, [currentImageDetails, currentImageIndex, currentJsonAnnotations, setMask_operationHistory, setMask_redoHistory]);

  const updateAnnotation = useCallback((updatedAnnotation: ViewAnnotation) => {
    if (!currentImageDetails) return;
    setAllImageAnnotations(prev => {
        const currentAnnos = prev[currentImageDetails.name]?.jsonAnnotations || [];
        const updatedAnnos = currentAnnos.map((a: ViewAnnotation) => a.id === updatedAnnotation.id ? updatedAnnotation : a);
        return { ...prev, [currentImageDetails.name]: { ...prev[currentImageDetails.name], jsonAnnotations: updatedAnnos } };
    });
  }, [currentImageDetails, setAllImageAnnotations]);

  const addAnnotation = useCallback((newAnnotation: ViewAnnotation) => {
    if (!currentImageDetails) return;
    addUndoRecord();
    setAllImageAnnotations(prev => {
        const annos = prev[currentImageDetails.name]?.jsonAnnotations || [];
        return { ...prev, [currentImageDetails.name]: { ...prev[currentImageDetails.name], jsonAnnotations: [...annos, newAnnotation] }};
    });
  }, [currentImageDetails, addUndoRecord, setAllImageAnnotations]);

  const removeAnnotationById = useCallback((idToRemove: string) => {
    if (!currentImageDetails) return;
    addUndoRecord();
    const updatedAnnotations = currentJsonAnnotations.filter(a => a.id !== idToRemove);
    setAllImageAnnotations(prev => ({ ...prev, [currentImageDetails.name]: { ...prev[currentImageDetails.name], jsonAnnotations: updatedAnnotations } }));
    if (selectedAnnotationId === idToRemove) {
      setSelectedAnnotationId(null);
    }
    message.success(`${t.deleteAnnotationTooltip} ${t.operationSuccessful}`);
  }, [currentImageDetails, currentJsonAnnotations, addUndoRecord, setAllImageAnnotations, t, selectedAnnotationId, setSelectedAnnotationId]);

  const performUndo = useCallback(() => {
    const history = mask_operationHistory[currentImageIndex] || [];
    if (history.length === 0 || !currentImageDetails) return;
    const lastOp = history[history.length - 1];
    const redoOp: MaskUndoOperation = { imageId: currentImageDetails.name, previousJsonAnnotations: currentJsonAnnotations };
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: [redoOp, ...(prev[currentImageIndex] || [])] }));
    setAllImageAnnotations(prev => ({...prev, [lastOp.imageId]: {...prev[lastOp.imageId], jsonAnnotations: lastOp.previousJsonAnnotations }}));
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: history.slice(0, -1) }));
    message.success(t.operationSuccessful);
  }, [mask_operationHistory, currentImageIndex, currentImageDetails, currentJsonAnnotations, setMask_redoHistory, setAllImageAnnotations, setMask_operationHistory, t.operationSuccessful]);

  const performRedo = useCallback(() => {
    const history = mask_redoHistory[currentImageIndex] || [];
    if (history.length === 0 || !currentImageDetails) return;
    const redoOp = history[0];
    const undoOp: MaskUndoOperation = { imageId: currentImageDetails.name, previousJsonAnnotations: currentJsonAnnotations };
    setMask_operationHistory(prev => ({ ...prev, [currentImageIndex]: [...(prev[currentImageIndex] || []), undoOp] }));
    setAllImageAnnotations(prev => ({...prev, [redoOp.imageId]: {...prev[redoOp.imageId], jsonAnnotations: redoOp.previousJsonAnnotations }}));
    setMask_redoHistory(prev => ({ ...prev, [currentImageIndex]: history.slice(1) }));
    message.success(t.operationSuccessful);
  }, [mask_redoHistory, currentImageIndex, currentImageDetails, currentJsonAnnotations, setMask_operationHistory, setAllImageAnnotations, setMask_redoHistory, t.operationSuccessful]);

  // Canvas事件处理
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageDetails || !canvasRef.current) return;
    const mousePos = canvasMousePos;
  
    if (activeTool === 'select') {
      const selectedAnno = activeViewAnnotations.find(a => a.id === selectedAnnotationId);
      if (selectedAnno && 'width' in selectedAnno) {
        const handles = getResizeHandles(selectedAnno);
        for(const handleKey of Object.keys(handles) as ResizeHandle[]) {
          const handle = handles[handleKey];
          if(isPointInRect(mousePos, {x: handle.x, y: handle.y, width: handle.size, height: handle.size})) {
            addUndoRecord();
            setDraggingState({ type: 'resize', handle: handleKey, startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) });
            return;
          }
        }
      }
      const clickedAnnotation = [...activeViewAnnotations].reverse().find((anno: ViewAnnotation) => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points);
          const translatedX = mousePos.x - centerX, translatedY = mousePos.y - centerY;
          const rotatedX = translatedX * Math.cos(-angleRad) - translatedY * Math.sin(-angleRad);
          const rotatedY = translatedX * Math.sin(-angleRad) + translatedY * Math.cos(-angleRad);
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
      } else setSelectedAnnotationId(null);
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      if (!currentCategory) { message.warning(t.noCategoriesFound); return; }
      setDraggingState({ type: 'move', startMousePos: mousePos, startAnnotationState: {} as any });
    }
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState || !currentImageDetails) return;
    const mousePos = canvasMousePos;
    if (activeTool === 'select' && draggingState.startAnnotationState.id) {
      const dx = mousePos.x - draggingState.startMousePos.x;
      const dy = mousePos.y - draggingState.startMousePos.y;
      const startState = draggingState.startAnnotationState;
      let newAnno: ViewAnnotation = JSON.parse(JSON.stringify(startState));
      if (draggingState.type === 'move') {
        if ('points' in newAnno && 'points' in startState) {
          newAnno.points[0] = { x: startState.points[0].x + dx, y: startState.points[0].y + dy };
          newAnno.points[1] = { x: startState.points[1].x + dx, y: startState.points[1].y + dy };
        } else if ('x' in newAnno && 'x' in startState) {
          newAnno.x = startState.x + dx; newAnno.y = startState.y + dy;
        }
      } else if (draggingState.type === 'resize' && draggingState.handle && 'width' in newAnno && 'width' in startState) {
        const { handle } = draggingState;
        const startBox = startState;
        if (handle.includes('right')) newAnno.width = Math.max(1, startBox.width + dx);
        if (handle.includes('left')) { newAnno.x = startBox.x + dx; newAnno.width = Math.max(1, startBox.width - dx); }
        if (handle.includes('bottom')) newAnno.height = Math.max(1, startBox.height + dy);
        if (handle.includes('top')) { newAnno.y = startBox.y + dy; newAnno.height = Math.max(1, startBox.height - dy); }
      }
      updateAnnotation(newAnno);
    }
  };
  const handleCanvasMouseUp = () => {
    if (!draggingState) return;
    if (activeTool === 'rectangle' || activeTool === 'diagonal') {
        const start = draggingState.startMousePos;
        const end = canvasMousePos;
        const color = categoryColors[currentCategory] || 'rgba(128,128,128,0.4)';
        if (activeTool === 'rectangle') {
            const width = Math.abs(start.x - end.x);
            const height = Math.abs(start.y - end.y);
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
  const handleCanvasClick = () => {
    if (!currentImageDetails || draggingState) return;
    if (activeTool === 'delete') {
      const annoToDelete = [...activeViewAnnotations].reverse().find((anno: ViewAnnotation) => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points);
          const t_mousePos = {x: canvasMousePos.x - centerX, y: canvasMousePos.y - centerY};
          const r_mousePos = {x: t_mousePos.x * Math.cos(-angleRad) - t_mousePos.y * Math.sin(-angleRad), y: t_mousePos.x * Math.sin(-angleRad) + t_mousePos.y * Math.cos(-angleRad)};
          return Math.abs(r_mousePos.x) <= length/2 && Math.abs(r_mousePos.y) <= anno.thickness/2;
        } else return isPointInRect(canvasMousePos, anno);
      });
      if(annoToDelete) removeAnnotationById(annoToDelete.id);
    }
  };

  // 文件与导航
  const processUploadedFiles = async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles) return;
    message.loading({ content: t.uploadFolder, key: 'fileProcessing', duration: 0 });
    const filesArray = Array.from(uploadedFiles);
    
    let newCats = [...Object.keys(defaultCategoryColors)];
    let newColors = { ...defaultCategoryColors };
    
    const classesFile = filesArray.find(f => f.name.toLowerCase() === "classes.txt");
    if(classesFile) {
        try {
            const text = await classesFile.text();
            const parsed = text.split('\n').map(l => l.trim()).filter(Boolean);
            if(parsed.length > 0) {
              newCats = parsed;
              const tempColors: {[key: string]: string} = {};
              parsed.forEach((cat, i) => { tempColors[cat] = categoryColors[cat] || defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[i % Object.keys(defaultCategoryColors).length]; });
              newColors = tempColors;
            }
        } catch(e) { message.error(`${t.errorReadFileGeneric} classes.txt`); }
    }
    
    const imageFiles = filesArray.filter(f => f.type.startsWith('image/'));
    const jsonFiles = filesArray.filter(f => f.name.endsWith('.json'));
    const sortedImageFiles = imageFiles.sort((a: File, b: File) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    
    const newAnnotations: {[imageName: string]: ImageAnnotationData} = {};
    
    for(const imgFile of sortedImageFiles) {
        newAnnotations[imgFile.name] = {jsonAnnotations: [], txtAnnotations: []};
        const baseName = getFileNameWithoutExtension(imgFile.name);
        const jsonFile = jsonFiles.find(f => getFileNameWithoutExtension(f.name) === baseName);
        if(jsonFile) {
            try {
                const rawJson = JSON.parse(await jsonFile.text());
                if (typeof rawJson !== 'object' || rawJson === null) throw new Error("JSON is not an object.");
                Object.entries(rawJson).forEach(([cat, annos]) => {
                    if(!newCats.includes(cat)) { newCats.push(cat); message.info(t.categoryNotFoundInClasses.replace('%s', cat)); }
                    if(!newColors[cat]) newColors[cat] = defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[Object.keys(newColors).length % Object.keys(defaultCategoryColors).length];
                    if(Array.isArray(annos)) {
                        annos.forEach((anno: any) => {
                            const color = newColors[cat] || '#cccccc80';
                            if(anno.points) newAnnotations[imgFile.name].jsonAnnotations.push({ id: generateUniqueId(), category: cat, color, points: anno.points, thickness: anno.thickness || currentLineWidth });
                            else if(anno.width) newAnnotations[imgFile.name].jsonAnnotations.push({ id: generateUniqueId(), category: cat, color, x: anno.x, y: anno.y, width: anno.width, height: anno.height, sourceLineWidth: anno.lineWidth || currentLineWidth });
                        });
                    }
                });
            } catch(e) { message.error(`${t.errorParseJsonFile} ${jsonFile.name}`); }
        }
    }
    
    setCategories(newCats); 
    setCategoryColors(newColors); 
    setImages(sortedImageFiles);
    setAllImageAnnotations(newAnnotations);
    setCurrentImageIndex(sortedImageFiles.length > 0 ? 0 : -1);
    setMask_operationHistory({});
    setMask_redoHistory({});
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
            zip.file(imageFile.name, imageFile);

            const imageName = imageFile.name;
            const annotations = allImageAnnotations[imageName]?.jsonAnnotations || [];
            const annotationsByCategory: { [key: string]: any[] } = {};
            
            annotations.forEach(anno => {
                if (!annotationsByCategory[anno.category]) {
                    annotationsByCategory[anno.category] = [];
                }
                const { id, color, category, ...rest } = anno;
                annotationsByCategory[category].push(rest);
            });

            const jsonContent = JSON.stringify(annotationsByCategory, null, 2);
            const baseName = getFileNameWithoutExtension(imageName);
            zip.file(`${baseName}.json`, jsonContent);
        }
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "annotations_export.zip");
        message.success({ content: t.exportSuccessMessage, key: 'exporting', duration: 3 });
    } catch (error: any) {
        console.error("Export failed:", error);
        message.error({ content: `${t.exportFailureMessage} ${error.message}`, key: 'exporting', duration: 3 });
    }
  };
  
  // AI 与类别管理
  const mockAiApiCall = (apiType: AiApiType): Promise<ViewAnnotation[]> => {
    return new Promise(resolve => {
        setTimeout(() => {
          if (!currentImageDetails || categories.length === 0) { resolve([]); return; }
          const { width: imgW, height: imgH } = currentImageDetails;
          const newAnnos: ViewAnnotation[] = [];
          const numAnnos = apiType === 'initialDetection' ? Math.floor(Math.random() * 5) + 3 : Math.floor(Math.random() * 2) + 1;
          for(let i=0; i<numAnnos; i++) {
            const cat = categories[Math.floor(Math.random() * categories.length)];
            const color = categoryColors[cat];
            if(Math.random() > 0.5) {
              const w = Math.random() * 0.2 * imgW + 20; const h = Math.random() * 0.2 * imgH + 20;
              const x = Math.random() * (imgW - w); const y = Math.random() * (imgH - h);
              newAnnos.push({ id: generateUniqueId(), category: cat, color, x,y,width:w,height:h, sourceLineWidth: currentLineWidth});
            } else {
              const p1 = { x: Math.random() * imgW, y: Math.random() * imgH };
              const p2 = { x: Math.random() * imgW, y: Math.random() * imgH };
              newAnnos.push({ id: generateUniqueId(), category: cat, color, points: [p1, p2], thickness: currentLineWidth });
            }
          }
          resolve(newAnnos);
        }, 1500);
      });
  };
  const handleAiAnnotation = async () => {
    if(!currentImageDetails) return;
    setIsAiAnnotating(true);
    const apiToCall = aiMode === 'auto' ? (currentJsonAnnotations.length === 0 ? 'initialDetection' : 'optimization') : manualAiEndpoint;
    try {
      const results = await mockAiApiCall(apiToCall);
      if(results.length > 0) {
        addUndoRecord();
        setAllImageAnnotations(prev => ({ ...prev, [currentImageDetails.name]: { ...prev[currentImageDetails.name], jsonAnnotations: [...currentJsonAnnotations, ...results] }}));
        message.success(t.operationSuccessful);
      } else { message.info("AI 未返回任何标注。"); }
    } catch(e) {
      message.error(t.aiFailed);
    } finally {
      setIsAiAnnotating(false);
    }
  };
  const handleAddClass = () => {
    const newClassName = `new_class_${categories.filter(c => c.startsWith('new_class')).length}`;
    if(categories.includes(newClassName)) return;
    const newCategories = [...categories, newClassName];
    const newCategoryColors = {...categoryColors, [newClassName]: Object.values(defaultCategoryColors)[newCategories.length % Object.keys(defaultCategoryColors).length]};
    setCategories(newCategories); setCategoryColors(newCategoryColors); setCurrentCategory(newClassName);
  };
  const handleUpdateClass = (oldName: string, newName: string) => {
    if(newName === oldName || newName.trim() === '' || categories.includes(newName)) return;
    const newNameTrimmed = newName.trim();
    setCategories(prev => prev.map(c => c === oldName ? newNameTrimmed : c));
    setCategoryColors(prev => {
      const newColors = {...prev};
      newColors[newNameTrimmed] = newColors[oldName];
      delete newColors[oldName];
      return newColors;
    });
    setAllImageAnnotations(prev => {
      const newAllAnnos = {...prev};
      Object.keys(newAllAnnos).forEach(imgName => {
        const annos = newAllAnnos[imgName]?.jsonAnnotations || [];
        annos.forEach((anno: ViewAnnotation) => { if(anno.category === oldName) anno.category = newNameTrimmed; });
      });
      return newAllAnnos;
    });
    if (currentCategory === oldName) {
      setCurrentCategory(newNameTrimmed);
    }
  };
  const handleUpdateColor = (catName: string, newColor: string) => {
    setCategoryColors(prev => ({...prev, [catName]: newColor}));
    setAllImageAnnotations(prev => {
      const newAllAnnos = {...prev};
      Object.keys(newAllAnnos).forEach(imgName => {
        const annos = newAllAnnos[imgName]?.jsonAnnotations || [];
        annos.forEach((anno: ViewAnnotation) => { if(anno.category === catName) anno.color = newColor; });
      });
      return newAllAnnos;
    });
  };
  const handleDeleteClass = (className: string) => {
    Modal.confirm({
        title: t.deleteClassConfirmTitle.replace('%s', className),
        content: t.deleteClassConfirmContent,
        okText: t.confirmDelete,
        okType: 'danger',
        cancelText: t.cancel,
        onOk: () => {
            const newCategories = categories.filter(c => c !== className);
            const newCategoryColors = { ...categoryColors };
            delete newCategoryColors[className];

            const newAllAnnotations = { ...allImageAnnotations };
            Object.keys(newAllAnnotations).forEach(imgName => {
                const currentAnnos = newAllAnnotations[imgName]?.jsonAnnotations || [];
                newAllAnnotations[imgName].jsonAnnotations = currentAnnos.filter(anno => anno.category !== className);
            });

            setCategories(newCategories);
            setCategoryColors(newCategoryColors);
            setAllImageAnnotations(newAllAnnotations);

            if (currentCategory === className) {
                setCurrentCategory(newCategories.length > 0 ? newCategories[0] : "");
            }
            message.success(t.classDeleted.replace('%s', className));
        }
    });
  };
  const handleExportClasses = () => saveAs(new Blob([categories.join('\n')], {type: "text/plain;charset=utf-8"}), "classes.txt");
  const handleImportClasses = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    const text = await file.text();
    const newCats = text.split('\n').map(l => l.trim()).filter(Boolean);
    const newColors: {[key: string]: string} = {};
    newCats.forEach((cat, i) => { newColors[cat] = categoryColors[cat] || defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[i % Object.keys(defaultCategoryColors).length] });
    setCategories(newCats); setCategoryColors(newColors);
    if(newCats.length > 0) setCurrentCategory(newCats[0]);
    message.success(`${newCats.length} ${t.category.toLowerCase()}(s) imported.`);
    if(classesFileRef.current) classesFileRef.current.value = "";
  };
  const handleClearAnnotations = () => {
    if (!currentImageDetails || currentJsonAnnotations.length === 0) return;
    addUndoRecord();
    setAllImageAnnotations(prev => ({ ...prev, [currentImageDetails.name]: { ...prev[currentImageDetails.name], jsonAnnotations: [] }}));
    setSelectedAnnotationId(null);
    message.success(t.clearAnnotationsButton + ' ' + t.operationSuccessful);
  };

  return (
    <Layout className="mask-operate-pro-layout">
        <Header className="top-header-pro">
            <div className="header-left-controls">
                <Title level={4} style={{ margin: 0 }}>{t.appName}</Title>
                <Button type="primary" icon={<FontAwesomeIcon icon={faUpload} />} onClick={() => folderUploadRef.current?.click()}>{t.uploadFolder}</Button>
                <input ref={folderUploadRef} type="file" {...{webkitdirectory:"true", directory:"true"} as any} multiple onChange={(e: ChangeEvent<HTMLInputElement>) => processUploadedFiles(e.target.files)} style={{ display: 'none' }}/>
            </div>
            <Space className="header-center-controls">
                <Button icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => navigateImage(-1)} disabled={!hasActiveImage || currentImageIndex === 0} />
                <span style={{ padding: '0 12px', minWidth: '200px', textAlign: 'center' }}>
                <Text className="current-file-text-pro" title={currentImageDetails?.name}>{currentImageDetails ? `${t.currentImage} ${currentImageDetails.name} (${currentImageIndex + 1}/${images.length})` : t.noImages}</Text>
                </span>
                <Button icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => navigateImage(1)} disabled={!hasActiveImage || currentImageIndex >= images.length - 1} />
            </Space>
            <div className="header-right-controls">
                <Tooltip title={t.undo}><Button icon={<FontAwesomeIcon icon={faUndo} />} onClick={performUndo} disabled={currentUndoStackSize === 0} /></Tooltip>
                <Tooltip title={t.redo}><Button icon={<FontAwesomeIcon icon={faRedo} />} onClick={performRedo} disabled={currentRedoStackSize === 0} /></Tooltip>
                <Button type="primary" icon={<FontAwesomeIcon icon={faFileArchive} />} onClick={handleExportAll} disabled={images.length === 0}>{t.exportAll}</Button>
            </div>
        </Header>
        
        <Layout hasSider>
            <Sider width={60} className="tool-sider-pro" theme="light">
                <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: '16px' }}>
                    <Tooltip title={t.selectTool} placement="right"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={!hasActiveImage} /></Tooltip>
                    <Tooltip title={t.rectTool} placement="right"><Button onClick={() => setActiveTool('rectangle')} type={activeTool === 'rectangle' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={!hasActiveImage} /></Tooltip>
                    <Tooltip title={t.diagonalTool} placement="right"><Button onClick={() => setActiveTool('diagonal')} type={activeTool === 'diagonal' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faDrawPolygon} />} disabled={!hasActiveImage} /></Tooltip>
                    <Tooltip title={t.deleteTool} placement="right"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={!hasActiveImage} /></Tooltip>
                    <Divider style={{margin: '8px 0'}}/>
                    <Tooltip title={t.aiAnnotate} placement="right"><Button onClick={handleAiAnnotation} type="text" className="tool-button-pro" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!hasActiveImage || isAiAnnotating} /></Tooltip>
                </Space>
            </Sider>
        
            <Layout className="main-content-wrapper-pro">
                <Content className="canvas-content-pro">
                    <div className="canvas-wrapper-pro">
                    <canvas ref={canvasRef}
                            onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onClick={handleCanvasClick}
                            className={`drawing-canvas-pro ${activeTool === 'delete' ? 'delete-cursor-pro' : (activeTool !== 'select' && hasActiveImage ? 'draw-cursor-pro' : '')}`}
                    />
                    </div>
                </Content>
                {!isInspectorVisible && (<Tooltip title={t.showPanel}><Button className="show-inspector-handle-pro" type="primary" icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => setIsInspectorVisible(true)} /></Tooltip>)}
            </Layout>

            <div className="resizer-pro" onMouseDown={() => setIsResizingInspector(true)} style={{ display: isInspectorVisible ? 'flex' : 'none' }} />

            <Sider width={isInspectorVisible ? inspectorWidth : 0} className="inspector-sider-pro" theme="light" collapsed={!isInspectorVisible} trigger={null} collapsedWidth={0}>
                <Tabs defaultActiveKey="1" className="inspector-tabs-pro" tabBarExtraContent={<Tooltip title={t.hidePanel}><Button type="text" icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => setIsInspectorVisible(false)} /></Tooltip>}>
                    <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="1">
                        <div className="tab-pane-content">
                        {hasActiveImage && activeViewAnnotations.length > 0 ? (
                            <Collapse accordion activeKey={selectedAnnotationId || undefined} onChange={(key) => setSelectedAnnotationId(Array.isArray(key) ? key[0] : key)}>
                            {activeViewAnnotations.map((item) => (
                                <Panel key={item.id} className="annotation-panel-item-pro" header={
                                  <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                                    <Space onClick={(e) => e.stopPropagation()}>
                                      <div className="color-indicator-pro" style={{ backgroundColor: item.color }} />
                                      <Text className="category-name-text-pro" title={item.category} ellipsis style={{ color: item.color.replace(/[^,]+(?=\))/, '1') }}>{item.category}</Text>
                                    </Space>
                                    <Tooltip title={t.deleteAnnotationTooltip}>
                                      <Button size="small" type="text" danger icon={<FontAwesomeIcon icon={faTrash}/>} onClick={(e) => { e.stopPropagation(); removeAnnotationById(item.id); }} />
                                    </Tooltip>
                                  </Flex>}>
                                  <Descriptions bordered size="small" column={1} className="annotation-details-pro">
                                    {'width' in item ? (
                                      <>
                                        <Descriptions.Item label="Type">Rectangle</Descriptions.Item>
                                        <Descriptions.Item label="X">{item.x.toFixed(1)}</Descriptions.Item>
                                        <Descriptions.Item label="Y">{item.y.toFixed(1)}</Descriptions.Item>
                                        <Descriptions.Item label="Width">{item.width.toFixed(1)}</Descriptions.Item>
                                        <Descriptions.Item label="Height">{item.height.toFixed(1)}</Descriptions.Item>
                                      </>
                                    ) : (
                                      <>
                                        <Descriptions.Item label="Type">Diagonal</Descriptions.Item>
                                        <Descriptions.Item label="Point 1">{`(${item.points[0].x.toFixed(1)}, ${item.points[0].y.toFixed(1)})`}</Descriptions.Item>
                                        <Descriptions.Item label="Point 2">{`(${item.points[1].x.toFixed(1)}, ${item.points[1].y.toFixed(1)})`}</Descriptions.Item>
                                        <Descriptions.Item label={t.thicknessLabel}>{item.thickness}</Descriptions.Item>
                                      </>
                                    )}
                                  </Descriptions>
                                </Panel>
                            ))}
                            </Collapse>
                        ) : <Text type="secondary" style={{textAlign: 'center', display: 'block', paddingTop: '20px'}}>{hasActiveImage ? t.noAnnotations : t.noImages}</Text>}
                        </div>
                    </TabPane>
                    <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2">
                        <div className="tab-pane-content">
                            <Form layout="vertical">
                                <Title level={5}>{t.classManagement}</Title>
                                <Flex justify="space-between" align="center" style={{marginBottom: 16}}>
                                <Tooltip title={t.importExportTooltip}><Space.Compact>
                                    <Button icon={<FontAwesomeIcon icon={faFileImport}/>} onClick={() => classesFileRef.current?.click()}>{t.uploadClassesFile}</Button>
                                    <Button icon={<FontAwesomeIcon icon={faFileExport}/>} onClick={handleExportClasses} disabled={categories.length === 0}>{t.exportClassesFile}</Button>
                                </Space.Compact></Tooltip>
                                <input ref={classesFileRef} type="file" accept=".txt" onChange={handleImportClasses} style={{display:'none'}}/>
                                </Flex>
                                <div className="class-list-container">
                                <List size="small" dataSource={categories} renderItem={(cat: string) => (
                                    <List.Item>
                                    <Flex gap="small" align="center" style={{width: '100%'}}>
                                        <input type="color" value={rgbaToHex(categoryColors[cat] || '#ffffff')} onChange={(e: ChangeEvent<HTMLInputElement>) => handleUpdateColor(cat, e.target.value + '66')} className="color-picker-input"/>
                                        <Input defaultValue={cat} onPressEnter={(e: React.KeyboardEvent<HTMLInputElement>) => handleUpdateClass(cat, e.currentTarget.value)} onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleUpdateClass(cat, e.currentTarget.value)}/>
                                        <Tooltip title={t.deleteAnnotationTooltip}><Button icon={<FontAwesomeIcon icon={faMinusCircle}/>} onClick={() => handleDeleteClass(cat)} danger/></Tooltip>
                                    </Flex>
                                    </List.Item>
                                )} />
                                </div>
                                <Button icon={<FontAwesomeIcon icon={faPlus}/>} onClick={handleAddClass} block style={{marginTop: 16}}>{t.addClass}</Button>
                            </Form>
                        </div>
                    </TabPane>
                    <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCog} /></Tooltip>} key="3">
                        <div className="tab-pane-content">
                            <Form layout="vertical">
                                <Title level={5}>{t.aiModelMode}</Title>
                                <Form.Item>
                                  <Radio.Group onChange={(e) => setAiMode(e.target.value)} value={aiMode} optionType="button" buttonStyle="solid">
                                      <Radio.Button value="auto">{t.aiModeAuto}</Radio.Button>
                                      <Radio.Button value="manual">{t.aiModeManual}</Radio.Button>
                                  </Radio.Group>
                                </Form.Item>
                                {aiMode === 'manual' && (
                                <Form.Item>
                                    <Radio.Group onChange={(e) => setManualAiEndpoint(e.target.value)} value={manualAiEndpoint}>
                                    <Radio value="initialDetection">{t.initialDetection}</Radio>
                                    <Radio value="optimization">{t.optimization}</Radio>
                                    </Radio.Group>
                                </Form.Item>
                                )}
                                <Divider/>
                                <Title level={5}>视图与标注设置</Title>
                                <Form.Item label={t.category}><Select value={currentCategory} onChange={(value: string) => setCurrentCategory(value)} disabled={!hasActiveImage || categories.length === 0} placeholder={t.noCategoriesFound}>{categories.map(cat => <Option key={cat} value={cat}>{cat}</Option>)}</Select></Form.Item>
                                <Form.Item label={t.lineWidth}><InputNumber min={1} max={50} value={currentLineWidth} onChange={(val) => setCurrentLineWidth(val || 1)} style={{ width: '100%' }} disabled={!hasActiveImage} /></Form.Item>
                                <Form.Item label={t.toggleAnnotationsView} valuePropName="checked"><Switch checked={showAnnotations} onChange={setShowAnnotations} /></Form.Item>
                                <Form.Item label={t.toggleCategoryInBox} valuePropName="checked"><Switch checked={showCategoryInBox} onChange={setShowCategoryInBox} /></Form.Item>
                                <Form.Item><Button danger icon={<FontAwesomeIcon icon={faEraser} />} onClick={handleClearAnnotations} block disabled={!hasActiveImage || currentJsonAnnotations.length === 0}>{t.clearAnnotationsButton}</Button></Form.Item>
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