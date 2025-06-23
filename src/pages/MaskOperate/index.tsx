import React, { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import { useModel } from '@umijs/max'; // 确保此依赖已安装
import { Layout, Button, Select, InputNumber, message, Typography, List, Collapse, Space, Tooltip, Form, Radio, Tabs, Flex, Divider, Input, Switch } from 'antd';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faChevronLeft, faChevronRight, faUndo, faRedo,
  faDrawPolygon, faTrash, faPaintBrush,
  faCog, faList, faMousePointer, faFileArchive, faEraser, faEye, faEyeSlash, faRobot,
  faFileImport, faFileExport, faPlus, faMinusCircle
} from "@fortawesome/free-solid-svg-icons";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { defaultCategoryColors, translations, RESIZE_HANDLE_SIZE } from './constants';
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;
const { TabPane } = Tabs;
const { Sider, Content, Header } = Layout;

// ===================================================================
// 接口与类型定义 (Interfaces & Types)
// ===================================================================
type Point = { x: number; y: number };

interface BaseAnnotation {
  id: string;
  category: string;
  color: string;
}

interface ViewBoxAnnotation extends BaseAnnotation {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceLineWidth: number;
}

interface ViewDiagonalAnnotation extends BaseAnnotation {
  points: [Point, Point];
  thickness: number;
}

type ViewAnnotation = ViewBoxAnnotation | ViewDiagonalAnnotation;

type ImageFileInfo = {
  name: string;
  url: string;
  originalFile: File;
  width: number;
  height: number;
};

type ImageAnnotationData = {
  jsonAnnotations: ViewAnnotation[];
  txtAnnotations: ViewAnnotation[];
  originalTxtFileContent?: string;
};

type UndoOperation = {
  imageId: string;
  previousJsonAnnotations: ViewAnnotation[];
};

type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete';
type AnnotationSourceType = 'json' | 'txt' | 'none';

type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';

type DraggingState = {
  type: 'move' | 'resize';
  handle?: ResizeHandle;
  startMousePos: Point;
  startAnnotationState: ViewAnnotation;
} | null;

type AiApiType = 'initialDetection' | 'optimization';

// ===================================================================
// 辅助函数 (Helper Functions)
// ===================================================================
const getFileNameWithoutExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return fileName;
  return fileName.substring(0, lastDotIndex);
};

const generateUniqueId = (): string => `anno_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// ===================================================================
// 主组件 (Main Component)
// ===================================================================
const MaskOperatePro = () => {
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];

  // 文件与标注数据状态
  const [images, setImages] = useState<ImageFileInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(-1);
  const [allImageAnnotations, setAllImageAnnotations] = useState<{ [imageName: string]: ImageAnnotationData }>({});
  
  // 类别管理状态
  const [categories, setCategories] = useState<string[]>(Object.keys(defaultCategoryColors));
  const [categoryColors, setCategoryColors] = useState<{ [key: string]: string }>({ ...defaultCategoryColors });

  // 工具与设置状态
  const [activeTool, setActiveTool] = useState<ActiveTool>('rectangle');
  const [currentCategory, setCurrentCategory] = useState<string>(Object.keys(defaultCategoryColors)[0] || "");
  const [currentLineWidth, setCurrentLineWidth] = useState<number>(5);
  const [annotationSource, setAnnotationSource] = useState<AnnotationSourceType>('json');
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [showCategoryInBox, setShowCategoryInBox] = useState<boolean>(true);

  // 布局与交互状态
  const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
  const [toolSiderWidth, setToolSiderWidth] = useState<number>(60); // 固定左侧边栏宽度
  const [inspectorWidth, setInspectorWidth] = useState<number>(320);
  const [isResizingInspector, setIsResizingInspector] = useState<boolean>(false);
  
  // 绘图与选择状态
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [draggingState, setDraggingState] = useState<DraggingState>(null);
  const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });

  // 历史记录状态
  const [undoStack, setUndoStack] = useState<UndoOperation[]>([]);
  const [redoStack, setRedoStack] = useState<UndoOperation[]>([]);

  // AI 功能状态
  const [isAiAnnotating, setIsAiAnnotating] = useState(false);
  const [aiMode, setAiMode] = useState<'auto' | 'manual'>('auto');
  const [manualAiEndpoint, setManualAiEndpoint] = useState<AiApiType>('initialDetection');

  // Ref 定义
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const classesFileRef = useRef<HTMLInputElement>(null);

  // 派生状态 (Derived State)
  const hasActiveImage = images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length;
  const currentImageInfo = hasActiveImage ? images[currentImageIndex] : null;

  const currentJsonAnnotations = (currentImageInfo && allImageAnnotations[currentImageInfo.name]?.jsonAnnotations) || [];
  const currentTxtAnnotations = (currentImageInfo && allImageAnnotations[currentImageInfo.name]?.txtAnnotations) || [];

  const activeViewAnnotations = useCallback((): ViewAnnotation[] => {
    if (!currentImageInfo || !showAnnotations) return [];
    if (annotationSource === 'json') return currentJsonAnnotations;
    if (annotationSource === 'txt') return currentTxtAnnotations;
    return [];
  }, [currentImageInfo, showAnnotations, annotationSource, currentJsonAnnotations, currentTxtAnnotations]);

  const currentCanvasAnnotations = activeViewAnnotations();

  // ===================================================================
  // Effects
  // ===================================================================
  useEffect(() => {
    if (categories.length > 0 && (!currentCategory || !categories.includes(currentCategory))) {
      setCurrentCategory(categories[0]);
    } else if (categories.length === 0 && currentCategory !== "") {
      setCurrentCategory("");
    }
  }, [categories, currentCategory]);
  
  useEffect(() => {
    redrawCanvas();
  }, [currentImageInfo, currentCanvasAnnotations, selectedAnnotationId, showCategoryInBox, activeTool, draggingState, canvasMousePos]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!currentImageInfo) return;
      const rect = canvasEl.getBoundingClientRect();
      const scaleX = currentImageInfo.width / rect.width;
      const scaleY = currentImageInfo.height / rect.height;
      setCanvasMousePos({
        x: Math.max(0, (e.clientX - rect.left) * scaleX),
        y: Math.max(0, (e.clientY - rect.top) * scaleY),
      });
    };
    canvasEl.addEventListener('mousemove', handleMouseMove);
    return () => canvasEl.removeEventListener('mousemove', handleMouseMove);
  }, [currentImageInfo]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingInspector) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setInspectorWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizingInspector(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingInspector]);


  // ===================================================================
  // 渲染函数 (Rendering Functions)
  // ===================================================================
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
  
    const drawLogic = () => {
      if (!currentImageInfo) return;
      const img = new Image();
      img.src = currentImageInfo.url;
  
      const performDraw = () => {
        if (!currentImageInfo) return;
        canvas.width = currentImageInfo.width;
        canvas.height = currentImageInfo.height;
        ctx.clearRect(0,0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
        currentCanvasAnnotations.forEach(anno => {
          const isSelected = anno.id === selectedAnnotationId;
          ctx.globalAlpha = isSelected ? 1.0 : 0.75;
          if ('points' in anno) {
            renderDiagonal(anno, ctx, false, isSelected);
          } else {
            renderRectangle(anno, ctx, false, isSelected);
          }
        });
    
        if (draggingState && (activeTool === 'rectangle' || activeTool === 'diagonal')) {
            const startPoint = draggingState.startMousePos;
            const endPoint = canvasMousePos;
            const tempId = generateUniqueId();
    
            if (activeTool === 'rectangle') {
              const previewRect: ViewBoxAnnotation = {
                id: tempId, x: Math.min(startPoint.x, endPoint.x), y: Math.min(startPoint.y, endPoint.y),
                width: Math.abs(startPoint.x - endPoint.x), height: Math.abs(startPoint.y - endPoint.y),
                category: currentCategory, color: categoryColors[currentCategory] || 'rgba(0,0,0,0.2)', sourceLineWidth: currentLineWidth,
              };
              renderRectangle(previewRect, ctx, true);
            } else if (activeTool === 'diagonal') {
              const previewDiag: ViewDiagonalAnnotation = {
                id: tempId, points: [startPoint, endPoint], category: currentCategory,
                color: categoryColors[currentCategory] || 'rgba(0,0,0,0.4)', thickness: currentLineWidth,
              };
              renderDiagonal(previewDiag, ctx, true);
            }
        }
        ctx.globalAlpha = 1.0;
      };
  
      img.onload = performDraw;
      // 修复: 如果图片已在缓存中，onload可能不会触发，需手动调用
      if (img.complete) {
        performDraw();
      }
    };
  
    if (currentImageInfo) {
      drawLogic();
    } else {
      const { offsetWidth, offsetHeight } = canvas;
      canvas.width = offsetWidth > 0 ? offsetWidth : 800;
      canvas.height = offsetHeight > 0 ? offsetHeight : 600;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e0e8f0"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0050b3"; ctx.textAlign = "center";
      ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
    }
  };
  
  const renderRectangle = (box: ViewBoxAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    if (isPreview) {
      ctx.save();
      ctx.setLineDash([8, 4]); ctx.strokeStyle = "#4A90E2"; ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();
      return;
    }
    
    ctx.fillStyle = box.color;
    ctx.strokeStyle = isSelected ? "#007bff" : "rgba(0,0,0,0.8)";
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  
    if (showCategoryInBox) {
      ctx.fillStyle = "black"; ctx.font = "bold 12px Arial"; ctx.textBaseline = "top";
      ctx.fillText(box.category, box.x + 3, box.y + 3, box.width - 6);
    }
  
    if (isSelected) {
      const handles = getResizeHandles(box);
      ctx.fillStyle = '#007bff';
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
      ctx.fillStyle = diag.color;
      ctx.strokeStyle = isSelected ? "#007bff" : "rgba(0,0,0,0.6)";
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.fill(); ctx.stroke();
    }
  
    ctx.restore();
  
    if (showCategoryInBox) {
      ctx.fillStyle = "black"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(diag.category, centerX, centerY - diag.thickness / 2 - 5);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }
  };

  // ===================================================================
  // 标注操作核心逻辑 (Annotation Core Logic)
  // ===================================================================
  const addAnnotation = (newAnnotation: ViewAnnotation) => {
    if (!currentImageInfo) return;
    addUndoRecord();
    const currentAnnos = allImageAnnotations[currentImageInfo.name]?.jsonAnnotations || [];
    setAllImageAnnotations(prev => ({
      ...prev,
      [currentImageInfo.name]: {
        ...prev[currentImageInfo.name],
        jsonAnnotations: [...currentAnnos, newAnnotation]
      }
    }));
  };

  const updateAnnotation = (updatedAnnotation: ViewAnnotation) => {
    if (!currentImageInfo) return;
    const currentAnnos = allImageAnnotations[currentImageInfo.name]?.jsonAnnotations || [];
    setAllImageAnnotations(prev => ({
      ...prev,
      [currentImageInfo.name]: {
        ...prev[currentImageInfo.name],
        jsonAnnotations: currentAnnos.map(a => a.id === updatedAnnotation.id ? updatedAnnotation : a)
      }
    }));
  };

  const removeAnnotationByIndex = (index: number) => {
    if (!currentImageInfo || index < 0 || index >= currentJsonAnnotations.length) return;
    addUndoRecord();
    const updatedAnnotations = [...currentJsonAnnotations];
    updatedAnnotations.splice(index, 1);
    setAllImageAnnotations(prev => ({
      ...prev,
      [currentImageInfo.name]: {
        ...prev[currentImageInfo.name],
        jsonAnnotations: updatedAnnotations
      }
    }));
    message.success(`${t.deleteAnnotationTooltip} ${t.operationSuccessful}`);
  };

  const getResizeHandles = (box: ViewBoxAnnotation): {[key in ResizeHandle]: {x: number, y: number, size: number, cursor: string}} => {
    const s = RESIZE_HANDLE_SIZE; const { x, y, width, height } = box;
    return {
      topLeft:    { x: x - s/2, y: y - s/2, size: s, cursor: 'nwse-resize' },
      top:        { x: x + width/2 - s/2, y: y - s/2, size: s, cursor: 'ns-resize' },
      topRight:   { x: x + width - s/2, y: y - s/2, size: s, cursor: 'nesw-resize' },
      left:       { x: x - s/2, y: y + height/2 - s/2, size: s, cursor: 'ew-resize' },
      right:      { x: x + width - s/2, y: y + height/2 - s/2, size: s, cursor: 'ew-resize' },
      bottomLeft: { x: x - s/2, y: y + height - s/2, size: s, cursor: 'nesw-resize' },
      bottom:     { x: x + width/2 - s/2, y: y + height - s/2, size: s, cursor: 'ns-resize' },
      bottomRight:{ x: x + width - s/2, y: y + height - s/2, size: s, cursor: 'nwse-resize' },
    };
  };
  
  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }): boolean => (
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
  );

  const getDiagonalParameters = (points: [Point, Point]) => {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    return {
      angleRad: Math.atan2(dy, dx),
      length: Math.sqrt(dx * dx + dy * dy),
      centerX: (points[0].x + points[1].x) / 2,
      centerY: (points[0].y + points[1].y) / 2,
    };
  };

  // ===================================================================
  // Canvas 事件处理 (Canvas Event Handlers)
  // ===================================================================
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageInfo || !canvasRef.current) return;
    const mousePos = canvasMousePos;
  
    if (activeTool === 'select') {
      const selectedAnno = currentCanvasAnnotations.find(a => a.id === selectedAnnotationId);
      if (selectedAnno && 'width' in selectedAnno) {
        const handles = getResizeHandles(selectedAnno);
        for(const handleKey of Object.keys(handles) as ResizeHandle[]) {
          const handle = handles[handleKey];
          if(isPointInRect(mousePos, {x: handle.x, y: handle.y, width: handle.size, height: handle.size})) {
            addUndoRecord();
            setDraggingState({
              type: 'resize', handle: handleKey, startMousePos: mousePos,
              startAnnotationState: JSON.parse(JSON.stringify(selectedAnno))
            });
            return;
          }
        }
      }
  
      const clickedAnnotation = [...currentCanvasAnnotations].reverse().find(anno => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points);
          const translatedX = mousePos.x - centerX, translatedY = mousePos.y - centerY;
          const rotatedX = translatedX * Math.cos(-angleRad) - translatedY * Math.sin(-angleRad);
          const rotatedY = translatedX * Math.sin(-angleRad) + translatedY * Math.cos(-angleRad);
          return Math.abs(rotatedX) <= length / 2 && Math.abs(rotatedY) <= anno.thickness / 2;
        } else {
          return isPointInRect(mousePos, anno);
        }
      });
  
      if (clickedAnnotation) {
        setSelectedAnnotationId(clickedAnnotation.id);
        if (selectedAnnotationId !== clickedAnnotation.id) return; 
        addUndoRecord();
        setDraggingState({
          type: 'move', startMousePos: mousePos,
          startAnnotationState: JSON.parse(JSON.stringify(clickedAnnotation))
        });
      } else {
        setSelectedAnnotationId(null);
      }
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      if (!currentCategory) { message.warning(t.noCategoriesFound); return; }
      setDraggingState({ type: 'move', startMousePos: mousePos, startAnnotationState: {} as any });
    }
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState || !currentImageInfo) return;
    const mousePos = canvasMousePos;
  
    if (activeTool === 'select' && draggingState.startAnnotationState.id) {
      const dx = mousePos.x - draggingState.startMousePos.x;
      const dy = mousePos.y - draggingState.startMousePos.y;
      const startState = draggingState.startAnnotationState;
      let newAnno = JSON.parse(JSON.stringify(startState));
  
      if (draggingState.type === 'move') {
        if ('points' in newAnno && 'points' in startState) {
          newAnno.points[0] = { x: startState.points[0].x + dx, y: startState.points[0].y + dy };
          newAnno.points[1] = { x: startState.points[1].x + dx, y: startState.points[1].y + dy };
        } else if ('x' in newAnno && 'x' in startState) {
          newAnno.x = startState.x + dx;
          newAnno.y = startState.y + dy;
        }
      } else if (draggingState.type === 'resize' && draggingState.handle && 'width' in newAnno && 'width' in startState) {
        const handle = draggingState.handle;
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
                const newRect: ViewBoxAnnotation = {
                    id: generateUniqueId(), x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
                    width, height, category: currentCategory, color, sourceLineWidth: currentLineWidth
                };
                addAnnotation(newRect);
            }
        } else if (activeTool === 'diagonal') {
            const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            if(length > 2) {
                const newDiag: ViewDiagonalAnnotation = {
                    id: generateUniqueId(), points: [start, end], category: currentCategory, color, thickness: currentLineWidth
                };
                addAnnotation(newDiag);
            }
        }
    }
    setDraggingState(null);
  };

  const handleCanvasClick = () => {
    if (!currentImageInfo || draggingState) return;
    if (activeTool === 'delete') {
      const idxToDelete = [...currentCanvasAnnotations].reverse().findIndex(anno => {
        if ('points' in anno) {
          const { angleRad, length, centerX, centerY } = getDiagonalParameters(anno.points);
          const t_mousePos = {x: canvasMousePos.x - centerX, y: canvasMousePos.y - centerY};
          const r_mousePos = {x: t_mousePos.x * Math.cos(-angleRad) - t_mousePos.y * Math.sin(-angleRad), y: t_mousePos.x * Math.sin(-angleRad) + t_mousePos.y * Math.cos(-angleRad)};
          return Math.abs(r_mousePos.x) <= length/2 && Math.abs(r_mousePos.y) <= anno.thickness/2;
        } else {
          return isPointInRect(canvasMousePos, anno);
        }
      });
      if(idxToDelete !== -1) removeAnnotationByIndex(currentCanvasAnnotations.length - 1 - idxToDelete);
    }
  }

  // ===================================================================
  // 文件与历史记录处理 (File & History Handlers)
  // ===================================================================
  const processUploadedFiles = async (uploadedFiles: File[]) => {
    message.loading({ content: t.uploadFolder, key: 'fileProcessing', duration: 0 });
    let newCats = [...categories]; let newColors = {...categoryColors};
    const classesFile = uploadedFiles.find(f => f.name.toLowerCase() === "classes.txt");
    if(classesFile) {
      try {
        const text = await classesFile.text();
        const parsed = text.split('\n').map(l => l.trim()).filter(Boolean);
        if(parsed.length > 0) {
          newCats = parsed;
          const tempColors: {[key: string]: string} = {};
          parsed.forEach((cat, i) => {
            tempColors[cat] = categoryColors[cat] || defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[i % Object.keys(defaultCategoryColors).length];
          });
          newColors = tempColors;
        }
      } catch(e) { message.error(`${t.errorReadFileGeneric} classes.txt`); }
    }
    
    const imageFiles = uploadedFiles.filter(f => f.type.match(/image\/.+/));
    const jsonFiles = uploadedFiles.filter(f => f.name.endsWith('.json'));
    const txtFiles = uploadedFiles.filter(f => f.name.endsWith('.txt') && f.name.toLowerCase() !== 'classes.txt');
    const newImagesInfo: ImageFileInfo[] = [];
    const newAnnotations: {[imageName: string]: ImageAnnotationData} = {};
    
    for(const imgFile of imageFiles.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}))) {
      const url = URL.createObjectURL(imgFile);
      const imgInfo = await new Promise<ImageFileInfo>(resolve => {
        const img = new Image();
        img.onload = () => resolve({name: imgFile.name, url, originalFile: imgFile, width: img.naturalWidth, height: img.naturalHeight});
        img.src = url;
      });
      newImagesInfo.push(imgInfo);
      newAnnotations[imgInfo.name] = {jsonAnnotations: [], txtAnnotations: []};

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
                if(anno.points) newAnnotations[imgInfo.name].jsonAnnotations.push({ id: generateUniqueId(), category: cat, color: newColors[cat], points: anno.points, thickness: anno.thickness || currentLineWidth });
                else if(anno.width) newAnnotations[imgInfo.name].jsonAnnotations.push({ id: generateUniqueId(), category: cat, color: newColors[cat], x: anno.x, y: anno.y, width: anno.width, height: anno.height, sourceLineWidth: anno.lineWidth || currentLineWidth });
              });
            }
          });
        } catch(e) { message.error(`${t.errorParseJsonFile} ${jsonFile.name}`); }
      }
    }
    setCategories(newCats); setCategoryColors(newColors); setImages(newImagesInfo); setAllImageAnnotations(newAnnotations);
    setCurrentImageIndex(newImagesInfo.length > 0 ? 0 : -1);
    setUndoStack([]); setRedoStack([]);
    message.success({content: `${newImagesInfo.length} ${t.filesProcessed} ${t.fileProcessingComplete}`, key: 'fileProcessing', duration: 3});
    if(folderUploadRef.current) folderUploadRef.current.value = "";
  };

  const addUndoRecord = () => {
    if (!currentImageInfo) return;
    setUndoStack(prev => [...prev, { imageId: currentImageInfo.name, previousJsonAnnotations: JSON.parse(JSON.stringify(currentJsonAnnotations)) }]);
    setRedoStack([]);
  };

  const performUndo = () => {
    if (undoStack.length === 0) return;
    const lastOp = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, { imageId: lastOp.imageId, previousJsonAnnotations: allImageAnnotations[lastOp.imageId].jsonAnnotations }]);
    setAllImageAnnotations(prev => ({...prev, [lastOp.imageId]: {...prev[lastOp.imageId], jsonAnnotations: lastOp.previousJsonAnnotations}}));
    setUndoStack(prev => prev.slice(0, -1));
    message.success("操作已撤销");
  };

  const performRedo = () => {
    if (redoStack.length === 0) return;
    const lastRedoOp = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, { imageId: lastRedoOp.imageId, previousJsonAnnotations: allImageAnnotations[lastRedoOp.imageId].jsonAnnotations }]);
    setAllImageAnnotations(prev => ({...prev, [lastRedoOp.imageId]: {...prev[lastRedoOp.imageId], jsonAnnotations: lastRedoOp.previousJsonAnnotations}}));
    setRedoStack(prev => prev.slice(0, -1));
    message.success("操作已重做");
  };

  const navigateImage = (offset: number) => {
    const newIndex = currentImageIndex + offset;
    if (newIndex >= 0 && newIndex < images.length) {
      setCurrentImageIndex(newIndex);
      setSelectedAnnotationId(null);
      setDraggingState(null);
    }
  };

  // ===================================================================
  // AI 与类别管理 (AI & Class Management)
  // ===================================================================
  const mockAiApiCall = (apiType: AiApiType): Promise<ViewAnnotation[]> => {
    return new Promise(resolve => {
      setTimeout(() => {
        if (!currentImageInfo || categories.length === 0) {
          resolve([]);
          return;
        }
        const { width: imgW, height: imgH } = currentImageInfo;
        const newAnnos: ViewAnnotation[] = [];
        const numAnnos = apiType === 'initialDetection' ? Math.floor(Math.random() * 5) + 3 : Math.floor(Math.random() * 2) + 1;
        for(let i=0; i<numAnnos; i++) {
          const cat = categories[Math.floor(Math.random() * categories.length)];
          const color = categoryColors[cat];
          if(Math.random() > 0.5) { // Rectangle
            const w = Math.random() * 0.2 * imgW + 20;
            const h = Math.random() * 0.2 * imgH + 20;
            const x = Math.random() * (imgW - w);
            const y = Math.random() * (imgH - h);
            newAnnos.push({ id: generateUniqueId(), category: cat, color, x,y,width:w,height:h, sourceLineWidth: currentLineWidth});
          } else { // Diagonal
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
    if(!currentImageInfo) return;
    setIsAiAnnotating(true);
    const apiToCall = aiMode === 'auto' ? (currentJsonAnnotations.length === 0 ? 'initialDetection' : 'optimization') : manualAiEndpoint;
    try {
      const results = await mockAiApiCall(apiToCall);
      if(results.length > 0) {
        addUndoRecord();
        setAllImageAnnotations(prev => ({
          ...prev,
          [currentImageInfo.name]: { ...prev[currentImageInfo.name], jsonAnnotations: [...currentJsonAnnotations, ...results] }
        }));
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
    setCategories(newCategories);
    setCategoryColors(newCategoryColors);
    setCurrentCategory(newClassName);
  };

  const handleUpdateClass = (oldName: string, newName: string) => {
    if(newName === oldName || categories.includes(newName)) return;
    setCategories(prev => prev.map(c => c === oldName ? newName : c));
    setCategoryColors(prev => {
      const newColors = {...prev};
      newColors[newName] = newColors[oldName];
      delete newColors[oldName];
      return newColors;
    });
    setAllImageAnnotations(prev => {
      const newAllAnnos = {...prev};
      Object.keys(newAllAnnos).forEach(imgName => {
        newAllAnnos[imgName].jsonAnnotations.forEach(anno => {
          if(anno.category === oldName) anno.category = newName;
        });
      });
      return newAllAnnos;
    });
  };

  const handleUpdateColor = (catName: string, newColor: string) => {
    setCategoryColors(prev => ({...prev, [catName]: newColor}));
    setAllImageAnnotations(prev => {
      const newAllAnnos = {...prev};
      Object.keys(newAllAnnos).forEach(imgName => {
        newAllAnnos[imgName].jsonAnnotations.forEach(anno => {
          if(anno.category === catName) anno.color = newColor;
        });
      });
      return newAllAnnos;
    });
  };

  const handleDeleteClass = (className: string) => {
    setCategories(prev => prev.filter(c => c !== className));
    setCategoryColors(prev => {
      const newColors = {...prev};
      delete newColors[className];
      return newColors;
    });
    // For simplicity, we don't delete existing annotations of this class. They will just use a default color.
  };

  const handleExportClasses = () => saveAs(new Blob([categories.join('\n')], {type: "text/plain;charset=utf-8"}), "classes.txt");

  const handleImportClasses = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const text = await file.text();
    const newCats = text.split('\n').map(l => l.trim()).filter(Boolean);
    const newColors: {[key: string]: string} = {};
    newCats.forEach((cat, i) => {
      newColors[cat] = categoryColors[cat] || defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[i % Object.keys(defaultCategoryColors).length]
    });
    setCategories(newCats);
    setCategoryColors(newColors);
    if(newCats.length > 0) setCurrentCategory(newCats[0]);
    message.success(`${newCats.length} ${t.category.toLowerCase()}(s) imported.`);
    if(classesFileRef.current) classesFileRef.current.value = "";
  };
  
  return (
    <Layout className="mask-operate-pro-layout">
      <Header className="top-header-pro">
        <div className="header-left-controls">
          <Title level={4} style={{ margin: 0 }}>{t.appName}</Title>
          <Button type="primary" icon={<FontAwesomeIcon icon={faUpload} />} onClick={() => folderUploadRef.current?.click()}>{t.uploadFolder}</Button>
          <input ref={folderUploadRef} type="file" {...{webkitdirectory:"true", directory:"true"} as any} multiple onChange={(e) => e.target.files && processUploadedFiles(Array.from(e.target.files))} style={{ display: 'none' }}/>
        </div>
        <div className="header-center-controls">
          <Space.Compact>
            <Button icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => navigateImage(-1)} disabled={!hasActiveImage || currentImageIndex === 0} />
            <span style={{ padding: '0 12px', minWidth: '200px', textAlign: 'center' }}>
              <Text className="current-file-text-pro" title={currentImageInfo?.name}>{currentImageInfo ? `${t.currentImage} ${currentImageInfo.name} (${currentImageIndex + 1}/${images.length})` : t.noImages}</Text>
            </span>
            <Button icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => navigateImage(1)} disabled={!hasActiveImage || currentImageIndex >= images.length - 1} />
          </Space.Compact>
        </div>
        <div className="header-right-controls">
          <Tooltip title="撤销 (Ctrl+Z)"><Button icon={<FontAwesomeIcon icon={faUndo} />} onClick={performUndo} disabled={undoStack.length === 0} /></Tooltip>
          <Tooltip title="重做 (Ctrl+Y)"><Button icon={<FontAwesomeIcon icon={faRedo} />} onClick={performRedo} disabled={redoStack.length === 0} /></Tooltip>
          <Button type="primary" icon={<FontAwesomeIcon icon={faFileArchive} />} onClick={() => {}} disabled={images.length === 0}>{t.exportAll}</Button>
        </div>
      </Header>
      
      <Layout hasSider>
        <Sider width={toolSiderWidth} className="tool-sider-pro" theme="light">
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
            <TabPane tab={<><FontAwesomeIcon icon={faList} /> <span className="tab-text">{t.annotations} {currentCanvasAnnotations.length > 0 ? `(${currentCanvasAnnotations.length})` : ''}</span></>} key="1">
              <div className="tab-pane-content">
              {hasActiveImage && currentCanvasAnnotations.length > 0 ? (
                <Collapse accordion>
                  {currentCanvasAnnotations.map((item, index) => (
                    <Panel key={item.id} className="annotation-panel-item-pro" header={
                      <Flex justify="space-between" align="center">
                        <Space>
                          <div className="color-indicator-pro" style={{ backgroundColor: item.color }} />
                          <Text className="category-name-text-pro" title={item.category} ellipsis style={{ color: item.color.replace(/[^,]+(?=\))/, '1') }}>{item.category}</Text>
                        </Space>
                        <Tooltip title={t.deleteAnnotationTooltip}>
                          <Button size="small" type="text" danger icon={<FontAwesomeIcon icon={faTrash}/>} onClick={(e) => { e.stopPropagation(); removeAnnotationByIndex(index); }} disabled={annotationSource === 'txt'} />
                        </Tooltip>
                      </Flex>}>
                        {/* Details here... */}
                    </Panel>
                  ))}
                </Collapse>
              ) : <Text type="secondary" style={{textAlign: 'center', display: 'block', paddingTop: '20px'}}>{hasActiveImage ? t.noAnnotations : t.noImages}</Text>}
              </div>
            </TabPane>
            <TabPane tab={<><FontAwesomeIcon icon={faCog} /> <span className="tab-text">{t.settings}</span></>} key="2">
              <div className="tab-pane-content">
                <Form layout="vertical">
                  <Title level={5}>{t.classManagement}</Title>
                  <Flex justify="space-between" align="center" style={{marginBottom: 16}}>
                    <Tooltip title={t.importExportTooltip}><Space.Compact>
                      <Button icon={<FontAwesomeIcon icon={faFileImport}/>} onClick={() => classesFileRef.current?.click()}>{t.uploadClassesFile}</Button>
                      <Button icon={<FontAwesomeIcon icon={faFileExport}/>} onClick={handleExportClasses}>{t.exportClassesFile}</Button>
                    </Space.Compact></Tooltip>
                    <input ref={classesFileRef} type="file" accept=".txt" onChange={handleImportClasses} style={{display:'none'}}/>
                  </Flex>
                  <div className="class-list-container">
                    <List size="small" dataSource={categories} renderItem={(cat) => (
                      <List.Item>
                        <Flex gap="small" align="center" style={{width: '100%'}}>
                          <input type="color" value={categoryColors[cat]?.replace(/, 0\.4\)/,')') || '#ffffff'} onChange={(e) => handleUpdateColor(cat, e.target.value + '80')} className="color-picker-input"/>
                          <Input value={cat} onPressEnter={(e) => handleUpdateClass(cat, e.currentTarget.value)} onBlur={(e) => handleUpdateClass(cat, e.currentTarget.value)}/>
                          <Tooltip title={t.delete}><Button icon={<FontAwesomeIcon icon={faMinusCircle}/>} onClick={() => handleDeleteClass(cat)} danger/></Tooltip>
                        </Flex>
                      </List.Item>
                    )} />
                  </div>
                  <Button icon={<FontAwesomeIcon icon={faPlus}/>} onClick={handleAddClass} block style={{marginTop: 16}}>{t.addClass}</Button>
                  <Divider/>
                  <Title level={5}>{t.aiModelMode}</Title>
                  <Form.Item label={t.aiModelMode}>
                    <Radio.Group onChange={(e) => setAiMode(e.target.value)} value={aiMode} optionType="button" buttonStyle="solid">
                      <Radio.Button value="auto">{t.aiModeAuto}</Radio.Button>
                      <Radio.Button value="manual">{t.aiModeManual}</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  {aiMode === 'manual' && (
                    <Form.Item label="Manual API Selection">
                      <Radio.Group onChange={(e) => setManualAiEndpoint(e.target.value)} value={manualAiEndpoint}>
                        <Radio value="initialDetection">{t.initialDetection}</Radio>
                        <Radio value="optimization">{t.optimization}</Radio>
                      </Radio.Group>
                    </Form.Item>
                  )}
                  <Divider/>
                  <Title level={5}>视图设置</Title>
                  <Form.Item label={t.category}><Select value={currentCategory} onChange={setCurrentCategory} disabled={!hasActiveImage || categories.length === 0} placeholder={t.noCategoriesFound}>{categories.map(cat => <Option key={cat} value={cat}>{cat}</Option>)}</Select></Form.Item>
                  <Form.Item label={t.lineWidth}><InputNumber min={1} max={50} value={currentLineWidth} onChange={(val) => setCurrentLineWidth(val || 1)} style={{ width: '100%' }} /></Form.Item>
                  <Form.Item label={t.annotationDisplaySource}><Radio.Group onChange={(e) => setAnnotationSource(e.target.value)} value={annotationSource} optionType="button" buttonStyle="solid"><Radio.Button value="json">{t.sourceJson}</Radio.Button><Radio.Button value="txt">{t.sourceTxt}</Radio.Button><Radio.Button value="none">{t.sourceNone}</Radio.Button></Radio.Group></Form.Item>
                  <Form.Item label={t.toggleAnnotationsView} valuePropName="checked"><Switch checked={showAnnotations} onChange={setShowAnnotations} /></Form.Item>
                  <Form.Item label={t.toggleCategoryInBox} valuePropName="checked"><Switch checked={showCategoryInBox} onChange={setShowCategoryInBox} /></Form.Item>
                  <Form.Item><Button danger icon={<FontAwesomeIcon icon={faEraser} />} onClick={() => {}} block disabled={!currentImageInfo || currentJsonAnnotations.length === 0}>{t.clearAnnotationsButton}</Button></Form.Item>
                </Form>
              </div>
            </TabPane>
          </Tabs>
        </Sider>
      </Layout>
    </Layout>
  );
};

export default MaskOperatePro;