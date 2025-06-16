// MaskOperate/index.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useModel } from 'umi';
import { Card, Button, Select, InputNumber, Layout, message, Typography, List, Collapse, Space, Tooltip, Form, Radio, Upload, Switch as AntSwitch, Tabs } from 'antd';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faChevronLeft, faChevronRight, faUndo, faRedo,
  faSave, faDrawPolygon, faTrash, faPaintBrush,
  faCog, faList, faMousePointer, faFileArchive, faEraser, faEye, faEyeSlash, faRobot
} from "@fortawesome/free-solid-svg-icons";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { defaultCategoryColors, translations, RESIZE_HANDLE_SIZE } from './constants';
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;
const { TabPane } = Tabs;

// ===================================================================
// 接口与类型定义
// ===================================================================
type Point = { x: number; y: number };

type ViewBoxAnnotation = {
  id: string;
  x: number; y: number; width: number; height: number;
  category: string; color: string; sourceLineWidth: number;
};
type ViewDiagonalAnnotation = {
  id: string;
  points: [Point, Point];
  category: string; color: string; thickness: number;
};
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


// ===================================================================
// 辅助函数
// ===================================================================
const getFileNameWithoutExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) return fileName;
  return fileName.substring(0, lastDotIndex);
};

const generateUniqueId = (): string => `anno_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const getCategoryColor = (categoryName: string, currentCategoryColors: { [key: string]: string }, allClasses: string[], defaultColors: {[key:string]:string}): string => {
  if (currentCategoryColors[categoryName]) {
    return currentCategoryColors[categoryName];
  }
  if (defaultColors[categoryName]) {
    return defaultColors[categoryName];
  }
  const categoryIndexInAll = allClasses.indexOf(categoryName);
  const defaultColorKeys = Object.keys(defaultColors);
  if (defaultColorKeys.length > 0) {
    if (categoryIndexInAll !== -1) {
      return defaultColors[defaultColorKeys[categoryIndexInAll % defaultColorKeys.length]];
    } else {
      const knownColorCategories = Object.keys(currentCategoryColors);
      return defaultColors[defaultColorKeys[knownColorCategories.length % defaultColorKeys.length]];
    }
  }
  return "rgba(128, 128, 128, 0.4)";
};


// ===================================================================
// 主组件
// ===================================================================
const MaskOperatePro = () => {
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];

  const [images, setImages] = useState<ImageFileInfo[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(-1);

  const [allImageAnnotations, setAllImageAnnotations] = useState<{ [imageName: string]: ImageAnnotationData }>({});

  const [categories, setCategories] = useState<string[]>(Object.keys(defaultCategoryColors));
  const [categoryColors, setCategoryColors] = useState<{ [key: string]: string }>({...defaultCategoryColors});

  const [activeTool, setActiveTool] = useState<ActiveTool>('rectangle');
  const [currentCategory, setCurrentCategory] = useState<string>(Object.keys(defaultCategoryColors)[0] || "");
  const [currentLineWidth, setCurrentLineWidth] = useState<number>(5);

  const [isInspectorVisible, setIsInspectorVisible] = useState<boolean>(true);
  const [inspectorWidth, setInspectorWidth] = useState<number>(320);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const [undoStack, setUndoStack] = useState<UndoOperation[]>([]);
  const [redoStack, setRedoStack] = useState<UndoOperation[]>([]);

  const [annotationListExpandedKeys, setAnnotationListExpandedKeys] = useState<string[] | number[]>([]);
  const [canvasMousePosition, setCanvasMousePosition] = useState<Point>({ x: 0, y: 0 });

  const [selectedAnnotationSource, setSelectedAnnotationSource] = useState<AnnotationSourceType>('json');
  const [showAnnotationsOnCanvas, setShowAnnotationsOnCanvas] = useState<boolean>(true);
  const [showCategoryInBox, setShowCategoryInBox] = useState<boolean>(true);

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [draggingState, setDraggingState] = useState<DraggingState>(null);
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandle | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const folderUploadInputRef = useRef<HTMLInputElement>(null);
  const classesFileInputRef = useRef<HTMLInputElement>(null);

  const hasActiveImage = images.length > 0 && currentImageIndex >= 0 && currentImageIndex < images.length;
  const currentImageInfo = hasActiveImage ? images[currentImageIndex] : null;

  const activeViewAnnotations = useCallback((): ViewAnnotation[] => {
    if (!currentImageInfo || !showAnnotationsOnCanvas) return [];
    const annotationsForCurrentImage = allImageAnnotations[currentImageInfo.name];
    if (!annotationsForCurrentImage) return [];

    if (selectedAnnotationSource === 'json') return annotationsForCurrentImage.jsonAnnotations || [];
    if (selectedAnnotationSource === 'txt') return annotationsForCurrentImage.txtAnnotations || [];
    return [];
  }, [currentImageInfo, allImageAnnotations, selectedAnnotationSource, showAnnotationsOnCanvas]);

  const currentCanvasAnnotations = activeViewAnnotations();
  const selectedAnnotation = currentCanvasAnnotations.find(a => a.id === selectedAnnotationId);

  useEffect(() => {
    if (categories.length > 0 && (!currentCategory || !categories.includes(currentCategory))) {
      setCurrentCategory(categories[0]);
    } else if (categories.length === 0 && currentCategory !== "") {
      setCurrentCategory("");
    }
  }, [categories, currentCategory]);

  useEffect(() => {
    redrawCanvas();
  }, [currentImageInfo, currentCanvasAnnotations, selectedAnnotationId, showCategoryInBox, activeTool, draggingState, canvasMousePosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTool !== 'select' || !selectedAnnotation || 'points' in selectedAnnotation) {
      if(canvas) canvas.style.cursor = 'default';
      return;
    }

    const checkHandles = (mousePos: Point) => {
      const handles = getResizeHandles(selectedAnnotation as ViewBoxAnnotation);
      for(const handle of Object.keys(handles)) {
        const h = handles[handle as ResizeHandle];
        if(isPointInRect(mousePos, {x: h.x, y: h.y, width: h.size, height: h.size})) {
          setHoveredHandle(handle as ResizeHandle);
          canvas.style.cursor = handles[handle as ResizeHandle].cursor;
          return;
        }
      }
      if(isPointInRect(mousePos, selectedAnnotation)) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
      setHoveredHandle(null);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (draggingState) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || !currentImageInfo) return;

      const scaleX = currentImageInfo.width / rect.width;
      const scaleY = currentImageInfo.height / rect.height;
      const xOnImage = (e.clientX - rect.left) * scaleX;
      const yOnImage = (e.clientY - rect.top) * scaleY;

      checkHandles({ x: xOnImage, y: yOnImage });
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);

  }, [selectedAnnotation, activeTool, draggingState, currentImageInfo]);


  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const handleMouseMoveForCoords = (event: MouseEvent) => {
      if (!currentImageInfo || !canvasRef.current) {
        setCanvasMousePosition({ x: 0, y: 0 });
        return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scaleX = currentImageInfo.width / rect.width;
      const scaleY = currentImageInfo.height / rect.height;
      const xOnImage = Math.round((event.clientX - rect.left) * scaleX);
      const yOnImage = Math.round((event.clientY - rect.top) * scaleY);
      setCanvasMousePosition({ x: Math.max(0, xOnImage), y: Math.max(0, yOnImage) });
    };

    canvasElement.addEventListener('mousemove', handleMouseMoveForCoords);
    return () => canvasElement.removeEventListener('mousemove', handleMouseMoveForCoords);
  }, [currentImageInfo]);

  const handleMouseDownOnResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setInspectorWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const getResizeHandles = (box: ViewBoxAnnotation): {[key in ResizeHandle]: {x: number, y: number, size: number, cursor: string}} => {
    const s = RESIZE_HANDLE_SIZE;
    const { x, y, width, height } = box;
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

  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }): boolean => {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (currentImageInfo) {
      const img = new Image();
      img.src = currentImageInfo.url;
      img.onload = () => {
        canvas.width = currentImageInfo.width;
        canvas.height = currentImageInfo.height;
        ctx.clearRect(0,0, canvas.width, canvas.height);

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        currentCanvasAnnotations.forEach(anno => {
          const isSelected = anno.id === selectedAnnotationId;
          ctx.globalAlpha = isSelected ? 1.0 : 0.75;
          if ('points' in anno) {
            renderDiagonal(anno, ctx, false, isSelected);
          } else {
            renderRectangle(anno, ctx, false, isSelected);
          }
        });

        if (draggingState) {
          const startPoint = draggingState.startMousePos;
          const endPoint = canvasMousePosition;

          if (activeTool === 'rectangle') {
            const previewRect = createRectangleFromPoints(startPoint, endPoint, currentCategory, categoryColors[currentCategory] || 'rgba(0,0,0,0.2)', currentLineWidth);
            renderRectangle(previewRect, ctx, true);
          } else if (activeTool === 'diagonal') {
            const previewDiag: ViewDiagonalAnnotation = {
              id: 'temp_diag',
              points: [startPoint, endPoint],
              category: currentCategory,
              color: categoryColors[currentCategory] || 'rgba(0,0,0,0.4)',
              thickness: currentLineWidth,
            };
            renderDiagonal(previewDiag, ctx, true);
          }
        }

        ctx.globalAlpha = 1.0;
      };
      if (img.complete) img.onload();
    } else {
      const displayWidth = canvas.offsetWidth || 800;
      const displayHeight = canvas.offsetHeight || 600;
      canvas.width = displayWidth; canvas.height = displayHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e0e8f0"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0050b3"; ctx.textAlign = "center";
      ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
    }
  };

  const renderRectangle = (box: ViewBoxAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    if (isPreview) {
      ctx.save();
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = "#4A90E2";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();
      return;
    }

    ctx.fillStyle = box.color;
    ctx.strokeStyle = isSelected ? "#007bff" : "rgba(0,0,0,0.8)";
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    if (showCategoryInBox && !isPreview) {
      ctx.fillStyle = "black";
      ctx.font = "bold 12px Arial";
      ctx.textBaseline = "top";
      const maxTextWidth = box.width - 6;
      let displayText = box.category;
      if(ctx.measureText(displayText).width > maxTextWidth && maxTextWidth > 10) {
        let newText = "";
        for(let char of box.category){
          if(ctx.measureText(newText + char + "...").width > maxTextWidth) break;
          newText += char;
        }
        displayText = newText ? newText + "..." : "";
      }
      if(displayText) ctx.fillText(displayText, box.x + 3, box.y + 3);
    }

    if (isSelected && !isPreview) {
      const handles = getResizeHandles(box);
      ctx.fillStyle = '#007bff';
      for (const handle of Object.values(handles)) {
        ctx.fillRect(handle.x, handle.y, handle.size, handle.size);
      }
    }
  };

  const renderDiagonal = (diag: ViewDiagonalAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    const { angleRad, length, centerX, centerY } = getDiagonalParameters(diag.points);
    if (length === 0) return;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angleRad);
    ctx.beginPath();
    ctx.rect(-length / 2, -diag.thickness / 2, length, diag.thickness);

    if (isPreview) {
      ctx.setLineDash([8, 4]);
      ctx.strokeStyle = "#4A90E2";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = diag.color;
      if (isSelected) {
        ctx.strokeStyle = "#007bff";
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
      }
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    if (showCategoryInBox && !isPreview) {
      ctx.fillStyle = "black";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(diag.category, centerX, centerY - diag.thickness / 2 - 5);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  };

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

  const createRectangleFromPoints = (p1: Point, p2: Point, categoryName: string, colorStr: string, lineWidthVal: number): ViewBoxAnnotation => {
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const width = Math.abs(p1.x - p2.x);
    const height = Math.abs(p1.y - p2.y);
    return {
      id: generateUniqueId(),
      x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)),
      width: parseFloat(width.toFixed(2)), height: parseFloat(height.toFixed(2)),
      category: categoryName, color: colorStr, sourceLineWidth: lineWidthVal,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageInfo) return;
    const mousePos = canvasMousePosition;

    if (activeTool === 'select') {
      let clickedOnAnnotation: ViewAnnotation | undefined = undefined;
      let clickedHandle: ResizeHandle | null = null;

      const selectedAnno = currentCanvasAnnotations.find(a => a.id === selectedAnnotationId);
      if (selectedAnno && !('points' in selectedAnno)) {
        const handles = getResizeHandles(selectedAnno);
        for(const handleKey of Object.keys(handles)) {
          const handle = handles[handleKey as ResizeHandle];
          if(isPointInRect(mousePos, {x: handle.x, y: handle.y, width: handle.size, height: handle.size})) {
            clickedOnAnnotation = selectedAnno;
            clickedHandle = handleKey as ResizeHandle;
            break;
          }
        }
      }

      if (!clickedOnAnnotation) {
        for (let i = currentCanvasAnnotations.length - 1; i >= 0; i--) {
          const anno = currentCanvasAnnotations[i];
          if ('points' in anno) {
            const diag = anno as ViewDiagonalAnnotation;
            const { angleRad, length, centerX, centerY } = getDiagonalParameters(diag.points);
            const translatedX = mousePos.x - centerX;
            const translatedY = mousePos.y - centerY;
            const rotatedX = translatedX * Math.cos(-angleRad) - translatedY * Math.sin(-angleRad);
            const rotatedY = translatedX * Math.sin(-angleRad) + translatedY * Math.cos(-angleRad);
            if (Math.abs(rotatedX) <= length / 2 && Math.abs(rotatedY) <= diag.thickness / 2) {
              clickedOnAnnotation = anno;
              break;
            }
          } else {
            if (isPointInRect(mousePos, anno as ViewBoxAnnotation)) {
              clickedOnAnnotation = anno;
              break;
            }
          }
        }
      }

      if (clickedOnAnnotation) {
        setSelectedAnnotationId(clickedOnAnnotation.id);
        addUndoRecord(currentImageInfo.name, currentCanvasAnnotations);
        setDraggingState({
          type: clickedHandle ? 'resize' : 'move',
          handle: clickedHandle || undefined,
          startMousePos: mousePos,
          startAnnotationState: JSON.parse(JSON.stringify(clickedOnAnnotation))
        });
      } else {
        setSelectedAnnotationId(null);
      }

    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      if (!currentCategory || !categoryColors[currentCategory]) {
        if (!currentCategory) message.warn("请先选择一个类别再进行标注!");
        else message.error(`类别 "${currentCategory}" 缺少颜色配置，无法标注!`);
        return;
      }
      const startPoint = { x: mousePos.x, y: mousePos.y };
      setDraggingState({ type: 'move' , startMousePos: startPoint, startAnnotationState: {} as any });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState || !currentImageInfo) return;

    const mousePos = canvasMousePosition;
    const dx = mousePos.x - draggingState.startMousePos.x;
    const dy = mousePos.y - draggingState.startMousePos.y;

    if (activeTool === 'select') {
      const updatedAnnotations = currentCanvasAnnotations.map(anno => {
        if (anno.id === draggingState.startAnnotationState.id) {
          const startState = draggingState.startAnnotationState;
          let newAnno = { ...startState };

          if (draggingState.type === 'move') {
            if ('points' in startState) {
              newAnno.points = [
                { x: startState.points[0].x + dx, y: startState.points[0].y + dy },
                { x: startState.points[1].x + dx, y: startState.points[1].y + dy }
              ] as [Point, Point];
            } else {
              (newAnno as ViewBoxAnnotation).x = (startState as ViewBoxAnnotation).x + dx;
              (newAnno as ViewBoxAnnotation).y = (startState as ViewBoxAnnotation).y + dy;
            }
          } else if (draggingState.type === 'resize' && draggingState.handle && !('points' in startState)) {
            const handle = draggingState.handle;
            const startBox = startState as ViewBoxAnnotation;
            let newBox = newAnno as ViewBoxAnnotation;
            if (handle.includes('right')) newBox.width = Math.max(1, startBox.width + dx);
            if (handle.includes('left')) {
              newBox.x = startBox.x + dx;
              newBox.width = Math.max(1, startBox.width - dx);
            }
            if (handle.includes('bottom')) newBox.height = Math.max(1, startBox.height + dy);
            if (handle.includes('top')) {
              newBox.y = startBox.y + dy;
              newBox.height = Math.max(1, startBox.height - dy);
            }
          }
          return newAnno;
        }
        return anno;
      });

      setAllImageAnnotations(prev => ({
        ...prev,
        [currentImageInfo.name]: {
          ...prev[currentImageInfo.name],
          jsonAnnotations: updatedAnnotations
        }
      }));
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageInfo || !draggingState) return;

    const startPoint = draggingState.startMousePos;
    const endPoint = canvasMousePosition;

    if (activeTool === 'rectangle') {
      const newRect = createRectangleFromPoints(startPoint, endPoint, currentCategory, categoryColors[currentCategory], currentLineWidth);
      if (newRect.width > 2 && newRect.height > 2) {
        addAnnotationToCurrentImage(newRect);
      }
    } else if (activeTool === 'diagonal') {
      const newDiagonal: ViewDiagonalAnnotation = {
        id: generateUniqueId(),
        points: [startPoint, endPoint],
        category: currentCategory,
        color: categoryColors[currentCategory],
        thickness: currentLineWidth,
      };
      if(getDiagonalParameters(newDiagonal.points).length > 2) {
        addAnnotationToCurrentImage(newDiagonal);
      }
    }

    setDraggingState(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageInfo || draggingState) return;

    if (activeTool === 'delete') {
      const clickPoint = canvasMousePosition;
      const annoIndexToRemove = findAnnotationIndexAtPoint(clickPoint, currentCanvasAnnotations);
      if (annoIndexToRemove > -1) {
        removeAnnotationFromCurrentImageByIndex(annoIndexToRemove);
      }
    }
  };

  const yoloLineToViewAnnotation = (line: string, imgWidth: number, imgHeight: number, classList: string[], colorMap: { [key: string]: string }, defaultLineWidth: number): ViewBoxAnnotation | null => {
    const parts = line.split(' ');
    if (parts.length < 5) return null;
    const classIndex = parseInt(parts[0], 10);
    const x_center = parseFloat(parts[1]) * imgWidth;
    const y_center = parseFloat(parts[2]) * imgHeight;
    const width = parseFloat(parts[3]) * imgWidth;
    const height = parseFloat(parts[4]) * imgHeight;
    const category = classList[classIndex] || `Class_${classIndex}`;
    const color = getCategoryColor(category, colorMap, classList, defaultCategoryColors);
    return {
      id: generateUniqueId(),
      x: x_center - width / 2,
      y: y_center - height / 2,
      width: width,
      height: height,
      category: category,
      color: color,
      sourceLineWidth: defaultLineWidth,
    };
  };

  const viewAnnotationToYoloString = (anno: ViewBoxAnnotation, imgWidth: number, imgHeight: number, classList: string[]): string | null => {
    const classIndex = classList.indexOf(anno.category);
    if (classIndex === -1) return null;
    const x_center = (anno.x + anno.width / 2) / imgWidth;
    const y_center = (anno.y + anno.height / 2) / imgHeight;
    const width = anno.width / imgWidth;
    const height = anno.height / imgHeight;
    return `${classIndex} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`;
  };

  const exportAllDataAsZip = async () => {
    if (images.length === 0) return;
    message.loading({ content: t.exportingMessage, key: 'exporting', duration: 0 });
    const zip = new JSZip();
    const originalFolder = zip.folder("original_data");
    const annotatedFolder = zip.folder("annotated_data");

    if (!originalFolder || !annotatedFolder) {
      message.error("创建导出文件夹失败！");
      return;
    }

    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx) {
      message.error("无法创建离屏画布！");
      return;
    }

    for (const imageInfo of images) {
      const { originalFile, name: imageName, width: imgWidth, height: imgHeight } = imageInfo;
      const baseName = getFileNameWithoutExtension(imageName);
      const annotationsForImage = allImageAnnotations[imageName];

      // 1. 处理 original_data 文件夹
      originalFolder.file(imageName, originalFile);
      originalFolder.file(`${baseName}.json`, "{}"); // 空JSON
      originalFolder.file(`${baseName}.txt`, "");     // 空TXT

      // 2. 处理 annotated_data 文件夹
      // 2a. 生成带标注的图片
      const imageToDraw = new Image();
      imageToDraw.src = imageInfo.url;
      await new Promise(resolve => { imageToDraw.onload = resolve; });

      offscreenCanvas.width = imgWidth;
      offscreenCanvas.height = imgHeight;
      ctx.clearRect(0, 0, imgWidth, imgHeight);
      ctx.drawImage(imageToDraw, 0, 0, imgWidth, imgHeight);

      const annotationsToDraw = annotationsForImage?.jsonAnnotations || [];
      annotationsToDraw.forEach(anno => {
        if ('points' in anno) {
          renderDiagonal(anno, ctx);
        } else {
          renderRectangle(anno, ctx);
        }
      });

      const blob = await new Promise<Blob | null>(resolve => offscreenCanvas.toBlob(resolve, 'image/png'));
      if (blob) {
        annotatedFolder.file(`${baseName}.png`, blob);
      }

      // 2b. 生成带标注的JSON文件
      const outputJson: { [category: string]: any[] } = {};
      if (annotationsToDraw.length > 0) {
        annotationsToDraw.forEach(anno => {
          if (!outputJson[anno.category]) outputJson[anno.category] = [];
          if ('points' in anno) {
            outputJson[anno.category].push({
              points: anno.points.map(p => ({ x: parseFloat(p.x.toFixed(2)), y: parseFloat(p.y.toFixed(2)) })),
              thickness: anno.thickness
            });
          } else {
            outputJson[anno.category].push({
              x: parseFloat(anno.x.toFixed(2)), y: parseFloat(anno.y.toFixed(2)),
              width: parseFloat(anno.width.toFixed(2)), height: parseFloat(anno.height.toFixed(2)),
              lineWidth: anno.sourceLineWidth
            });
          }
        });
      }
      annotatedFolder.file(`${baseName}.json`, JSON.stringify(outputJson, null, 2));

      // 2c. 生成带标注的TXT文件
      const yoloContent = annotationsToDraw
        .filter(anno => 'width' in anno)
        .map(anno => viewAnnotationToYoloString(anno as ViewBoxAnnotation, imgWidth, imgHeight, categories))
        .filter(str => str !== null)
        .join('\n');
      annotatedFolder.file(`${baseName}.txt`, yoloContent);
    }

    // 3. 为两个文件夹都添加 classes.txt
    const classesContent = categories.join('\n');
    originalFolder.file("classes.txt", classesContent);
    annotatedFolder.file("classes.txt", classesContent);

    try {
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "structured_annotated_data.zip");
      message.success({ content: t.exportSuccessMessage, key: 'exporting', duration: 3 });
    } catch (error) {
      message.error({ content: `${t.exportFailureMessage} ${(error as Error).message}`, key: 'exporting', duration: 3 });
      console.error("ZIP Export Error:", error);
    }
  };

  const processUploadedFiles = async (uploadedFiles: File[]) => {
    message.loading({ content: t.uploadFolder, key: 'fileProcessing', duration: 0 });
    let workingCategories = [...categories];
    let workingCategoryColors = {...categoryColors};
    const classesFile = uploadedFiles.find(f => f.name.toLowerCase() === "classes.txt");
    if (classesFile) {
      try {
        const classesText = await classesFile.text();
        const parsedCats = classesText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (parsedCats.length > 0) {
          workingCategories = parsedCats;
          const newClrs: { [key: string]: string } = {};
          parsedCats.forEach((cat, idx) => {
            newClrs[cat] = categoryColors[cat] || defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[idx % Object.values(defaultCategoryColors).length] || `hsl(${ (idx * 360 / parsedCats.length) % 360 }, 70%, 60%)`;
          });
          workingCategoryColors = newClrs;
        }
      } catch (e) { message.error(`${t.errorReadFileGeneric} classes.txt: ${(e as Error).message}`); }
    }
    const imageInputFiles = uploadedFiles.filter(f => f.type.match(/image\/(jpeg|png|jpg)/i));
    const jsonInputFiles = uploadedFiles.filter(f => f.name.toLowerCase().endsWith(".json"));
    const txtInputFiles = uploadedFiles.filter(f => f.name.toLowerCase().endsWith(".txt") && f.name.toLowerCase() !== "classes.txt");
    const newImages: ImageFileInfo[] = [];
    const newAnnotationsData: { [imageName: string]: ImageAnnotationData } = {};
    let jsonAnnotationsFoundCount = 0;
    let filesProcessedCount = 0;
    for (const imgFile of imageInputFiles.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      filesProcessedCount++;
      const originalImageName = imgFile.name;
      const baseImageName = getFileNameWithoutExtension(originalImageName);
      const imageUrl = URL.createObjectURL(imgFile);
      try {
        const imageInfo = await new Promise<ImageFileInfo>((resolve, reject) => {
          const imageElement = new Image();
          imageElement.onload = () => resolve({ name: originalImageName, url: imageUrl, originalFile: imgFile, width: imageElement.naturalWidth, height: imageElement.naturalHeight });
          imageElement.onerror = () => reject(new Error(`无法加载图片: ${originalImageName}`));
          imageElement.src = imageUrl;
        });
        newImages.push(imageInfo);
        newAnnotationsData[imageInfo.name] = { jsonAnnotations: [], txtAnnotations: [], originalTxtFileContent: undefined };
        const currentImgWidth = imageInfo.width;
        const currentImgHeight = imageInfo.height;
        const correspondingJsonFile = jsonInputFiles.find(f => getFileNameWithoutExtension(f.name) === baseImageName);
        if (correspondingJsonFile) {
          try {
            const jsonContentText = await correspondingJsonFile.text();
            const rawJsonObject = JSON.parse(jsonContentText);
            if (rawJsonObject && typeof rawJsonObject === 'object' && !Array.isArray(rawJsonObject)) {
              for (const categoryName in rawJsonObject) {
                if (Object.prototype.hasOwnProperty.call(rawJsonObject, categoryName)) {
                  const annotationsForCategory = rawJsonObject[categoryName];
                  if (!Array.isArray(annotationsForCategory)) continue;
                  if (!workingCategories.includes(categoryName)) {
                    workingCategories.push(categoryName);
                    message.info(t.categoryNotFoundInClasses.replace('%s', categoryName));
                  }
                  if(!workingCategoryColors[categoryName]){
                    const defaultColorKeys = Object.keys(defaultCategoryColors);
                    workingCategoryColors[categoryName] = defaultCategoryColors[categoryName] || (defaultColorKeys.length > 0 ? defaultCategoryColors[defaultColorKeys[Object.keys(workingCategoryColors).length % defaultColorKeys.length]] : "rgba(100,100,100,0.5)");
                  }
                  const annoColor = workingCategoryColors[categoryName];
                  annotationsForCategory.forEach((anno: any) => {
                    let newViewAnnotation: ViewAnnotation | null = null;
                    if (anno.points && Array.isArray(anno.points) && anno.points.length === 2 && typeof anno.points[0]?.x === 'number' && typeof anno.points[0]?.y === 'number' && typeof anno.points[1]?.x === 'number' && typeof anno.points[1]?.y === 'number') {
                      newViewAnnotation = { id: generateUniqueId(), points: [{x: anno.points[0].x, y: anno.points[0].y}, {x: anno.points[1].x, y: anno.points[1].y}] as [Point, Point], category: categoryName, color: annoColor, thickness: (typeof anno.thickness === 'number' && anno.thickness > 0) ? anno.thickness : currentLineWidth };
                    } else if (typeof anno.x === 'number' && typeof anno.y === 'number' && typeof anno.width === 'number' && anno.width > 0 && typeof anno.height === 'number' && anno.height > 0) {
                      newViewAnnotation = { id: generateUniqueId(), x: anno.x, y: anno.y, width: anno.width, height: anno.height, category: categoryName, color: annoColor, sourceLineWidth: (typeof anno.lineWidth === 'number' && anno.lineWidth > 0) ? anno.lineWidth : currentLineWidth };
                    }
                    if(newViewAnnotation) {
                      newAnnotationsData[imageInfo.name].jsonAnnotations.push(newViewAnnotation);
                      jsonAnnotationsFoundCount++;
                    }
                  });
                }
              }
            } else { message.error(t.jsonNotObjectError.replace('%s', correspondingJsonFile.name)); }
          } catch (e) { message.error(`${t.errorParseJsonFile} ${correspondingJsonFile.name}: ${(e as Error).message}`); console.error("JSON parsing error details for file " + correspondingJsonFile.name + ":", e); }
        }
        const correspondingTxtFile = txtInputFiles.find(f => getFileNameWithoutExtension(f.name) === baseImageName);
        if (correspondingTxtFile) {
          try {
            const txtContent = await correspondingTxtFile.text();
            newAnnotationsData[imageInfo.name].originalTxtFileContent = txtContent;
            const yoloLines = txtContent.split('\n').filter(line => line.trim() !== '');
            newAnnotationsData[imageInfo.name].txtAnnotations = yoloLines.map(line => yoloLineToViewAnnotation(line, currentImgWidth, currentImgHeight, workingCategories, workingCategoryColors, currentLineWidth)).filter(anno => anno !== null) as ViewBoxAnnotation[];
          } catch (e) { message.error(`${t.errorParseTxtFile} ${correspondingTxtFile.name}: ${(e as Error).message}`); }
        }
      } catch (imgError) { message.error((imgError as Error).message); }
    }
    setCategories(workingCategories);
    setCategoryColors(workingCategoryColors);
    if (workingCategories.length > 0 && (!currentCategory || !workingCategories.includes(currentCategory))) { setCurrentCategory(workingCategories[0]); }
    setImages(newImages);
    setAllImageAnnotations(prev => ({ ...prev, ...newAnnotationsData }));
    setCurrentImageIndex(newImages.length > 0 ? 0 : -1);
    setUndoStack([]);
    setRedoStack([]);
    let successMsg = `${filesProcessedCount} ${t.filesProcessed} `;
    if (jsonAnnotationsFoundCount > 0) { successMsg += `${jsonAnnotationsFoundCount} JSON ${t.annotations.toLowerCase()} ${t.jsonLoadSuccess.toLowerCase()}. `; }
    successMsg += t.fileProcessingComplete;
    message.success({ content: successMsg, key: 'fileProcessing', duration: 5 });
    if (folderUploadInputRef.current) folderUploadInputRef.current.value = "";
  };

  const findAnnotationIndexAtPoint = (point: Point, annotationsToSearch: ViewAnnotation[]): number => {
    for (let i = annotationsToSearch.length - 1; i >= 0; i--) {
      const anno = annotationsToSearch[i];
      if ('points' in anno) {
        const diag = anno as ViewDiagonalAnnotation;
        const { angleRad, length, centerX, centerY } = getDiagonalParameters(diag.points);
        if (length === 0) continue;
        const translatedX = point.x - centerX;
        const translatedY = point.y - centerY;
        const rotatedX = translatedX * Math.cos(-angleRad) - translatedY * Math.sin(-angleRad);
        const rotatedY = translatedX * Math.sin(-angleRad) + translatedY * Math.cos(-angleRad);
        if (Math.abs(rotatedX) <= length / 2 && Math.abs(rotatedY) <= diag.thickness / 2) { return i; }
      } else {
        const box = anno as ViewBoxAnnotation;
        if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) { return i; }
      }
    }
    return -1;
  };

  const addAnnotationToCurrentImage = (newAnnotation: ViewAnnotation) => {
    if (!currentImageInfo) return;
    const currentAnnosData = allImageAnnotations[currentImageInfo.name] || { jsonAnnotations: [], txtAnnotations: [], originalTxtFileContent: undefined };
    addUndoRecord(currentImageInfo.name, currentAnnosData.jsonAnnotations);
    const updatedJsonAnnotations = [...currentAnnosData.jsonAnnotations, newAnnotation];
    setAllImageAnnotations(prev => ({...prev, [currentImageInfo.name]: { ...currentAnnosData, jsonAnnotations: updatedJsonAnnotations } }));
  };

  const removeAnnotationFromCurrentImageByIndex = (indexInView: number) => {
    if (!currentImageInfo || indexInView < 0 || !currentCanvasAnnotations || indexInView >= currentCanvasAnnotations.length) return;
    const annotationToRemoveFromView = currentCanvasAnnotations[indexInView];
    const currentJsonData = allImageAnnotations[currentImageInfo.name]?.jsonAnnotations;
    if (!currentJsonData) { message.error("无法找到当前图片的JSON标注数据进行删除。"); return; }
    const actualJsonIndex = currentJsonData.findIndex(a => a.id === annotationToRemoveFromView.id);
    if (actualJsonIndex === -1) { message.warn("试图删除的标注在JSON源中未找到。"); return; }
    addUndoRecord(currentImageInfo.name, currentJsonData);
    const updatedJsonAnnotations = [...currentJsonData];
    updatedJsonAnnotations.splice(actualJsonIndex, 1);
    setAllImageAnnotations(prev => ({ ...prev, [currentImageInfo.name]: { ...(prev[currentImageInfo.name] || { jsonAnnotations: [], txtAnnotations: [], originalTxtFileContent: undefined }), jsonAnnotations: updatedJsonAnnotations } }));
    message.success(t.deleteButtonText + " " + t.operationSuccessful);
  };

  const addUndoRecord = (imageId: string, currentJsonAnnotations: ViewAnnotation[]) => {
    setUndoStack(prev => [...prev, { imageId: imageId, previousJsonAnnotations: JSON.parse(JSON.stringify(currentJsonAnnotations)) }]);
    setRedoStack([]);
  };

  const performUndo = () => {
    if (undoStack.length === 0) {
      message.info("没有更多可撤销的操作");
      return;
    }
    const lastOperation = undoStack[undoStack.length - 1];
    const annotationsToPushToRedo = allImageAnnotations[lastOperation.imageId]?.jsonAnnotations || [];
    setRedoStack(prev => [...prev, { imageId: lastOperation.imageId, previousJsonAnnotations: annotationsToPushToRedo }]);
    setAllImageAnnotations(prev => ({ ...prev, [lastOperation.imageId]: { ...(prev[lastOperation.imageId] || { jsonAnnotations: [], txtAnnotations: [] }), jsonAnnotations: lastOperation.previousJsonAnnotations } }));
    setUndoStack(prev => prev.slice(0, -1));
    message.success("操作已撤销");
  };

  const performRedo = () => {
    if (redoStack.length === 0) {
      message.info("没有更多可重做的操作");
      return;
    }
    const lastRedoOperation = redoStack[redoStack.length - 1];
    const annotationsToPushToUndo = allImageAnnotations[lastRedoOperation.imageId]?.jsonAnnotations || [];
    setUndoStack(prev => [...prev, { imageId: lastRedoOperation.imageId, previousJsonAnnotations: annotationsToPushToUndo }]);
    setAllImageAnnotations(prev => ({ ...prev, [lastRedoOperation.imageId]: { ...(prev[lastRedoOperation.imageId] || { jsonAnnotations: [], txtAnnotations: [] }), jsonAnnotations: lastRedoOperation.previousJsonAnnotations } }));
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

  const handleClearCurrentJsonAnnotations = () => {
    if (!currentImageInfo) return;
    const currentAnnosData = allImageAnnotations[currentImageInfo.name];
    if (!currentAnnosData || !currentAnnosData.jsonAnnotations || currentAnnosData.jsonAnnotations.length === 0) { message.info("当前图片的JSON标注已为空。"); return; }
    addUndoRecord(currentImageInfo.name, currentAnnosData.jsonAnnotations);
    setAllImageAnnotations(prev => ({ ...prev, [currentImageInfo.name]: { ...currentAnnosData, jsonAnnotations: [] } }));
    message.success("当前图片的JSON源标注已清空。");
  };

  const handleManualClassesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    message.loading({ content: '正在处理 classes.txt...', key: 'classesProcessing', duration: 0 });
    try {
      const classesText = await file.text();
      const parsedCategories = classesText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (parsedCategories.length > 0) {
        const newColors: { [key: string]: string } = {};
        const oldCategoryColors = {...categoryColors};
        parsedCategories.forEach((cat, idx) => {
          newColors[cat] = oldCategoryColors[cat] || defaultCategoryColors[cat] || Object.values(defaultCategoryColors)[idx % Object.values(defaultCategoryColors).length] || `hsl(${(idx * 360 / parsedCategories.length) % 360}, 70%, 60%)`;
        });
        setCategories(parsedCategories);
        setCategoryColors(newColors);
        if (parsedCategories.length > 0 && (!currentCategory || !parsedCategories.includes(currentCategory))) { setCurrentCategory(parsedCategories[0]); }
        else if (parsedCategories.length === 0) { setCurrentCategory(""); }
        message.success({ content: `classes.txt 已更新: ${parsedCategories.length} 个类别。`, key: 'classesProcessing', duration: 3 });
      } else { message.warn({ content: `上传的 classes.txt 为空或格式无效。`, key: 'classesProcessing', duration: 3 }); }
    } catch (e) { message.error({ content: `${t.errorReadFileGeneric} classes.txt: ${(e as Error).message}`, key: 'classesProcessing', duration: 3 }); }
    if (classesFileInputRef.current) classesFileInputRef.current.value = "";
  };

  return (
    <Layout className="mask-operate-pro-layout" hasSider>
      <Layout.Sider width={60} className="tool-sider-pro">
        <Space direction="vertical" align="center" style={{ width: '100%', paddingTop: '16px' }}>
          <Tooltip title={t.selectTool} placement="right"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faMousePointer} size="lg" />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.rectTool} placement="right"><Button onClick={() => setActiveTool('rectangle')} type={activeTool === 'rectangle' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faPaintBrush} size="lg" />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.diagonalTool} placement="right"><Button onClick={() => setActiveTool('diagonal')} type={activeTool === 'diagonal' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faDrawPolygon} size="lg" />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.deleteTool} placement="right"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} className="tool-button-pro" icon={<FontAwesomeIcon icon={faTrash} size="lg" />} danger={activeTool === 'delete'} disabled={!hasActiveImage} /></Tooltip>
        </Space>
      </Layout.Sider>

      <Layout className="main-content-layout-pro">
        <Layout.Header className="top-toolbar-pro">
          <Space wrap size="small">
            <Button type="primary" icon={<FontAwesomeIcon icon={faUpload} />} onClick={() => folderUploadInputRef.current?.click()}> {t.uploadFolder} </Button>
            <input ref={folderUploadInputRef} type="file" {...{webkitdirectory:"true", directory:"true"}} multiple onChange={(e) => e.target.files && processUploadedFiles(Array.from(e.target.files))} style={{ display: 'none' }}/>
          </Space>
          <Space wrap size="small">
            <Button icon={<FontAwesomeIcon icon={faChevronLeft} />} onClick={() => navigateImage(-1)} disabled={!hasActiveImage || currentImageIndex === 0} />
            <Text className="image-info-text-pro" title={currentImageInfo?.name}>{currentImageInfo ? `${t.currentImage} ${currentImageInfo.name} (${currentImageIndex + 1}/${images.length})` : t.noImages}</Text>
            <Button icon={<FontAwesomeIcon icon={faChevronRight} />} onClick={() => navigateImage(1)} disabled={!hasActiveImage || currentImageIndex >= images.length - 1} />
          </Space>
          <Space wrap size="small">
            <Tooltip title="撤销 (Ctrl+Z)"><Button icon={<FontAwesomeIcon icon={faUndo} />} onClick={performUndo} disabled={undoStack.length === 0} /></Tooltip>
            <Tooltip title="重做 (Ctrl+Y)"><Button icon={<FontAwesomeIcon icon={faRedo} />} onClick={performRedo} disabled={redoStack.length === 0} /></Tooltip>
            <Button type="primary" icon={<FontAwesomeIcon icon={faFileArchive} />} onClick={exportAllDataAsZip} disabled={images.length === 0}>{t.exportAll}</Button>
          </Space>
        </Layout.Header>

        <Layout.Content className="canvas-content-pro">
          <div className="canvas-wrapper-pro">
            <canvas ref={canvasRef}
                    onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onClick={handleCanvasClick}
                    className={`drawing-canvas-pro ${activeTool === 'delete' ? 'delete-cursor-pro' : (activeTool !== 'select' && hasActiveImage ? 'draw-cursor-pro' : '')}`}
            />
          </div>
        </Layout.Content>
      </Layout>

      <div className="resizer" onMouseDown={handleMouseDownOnResize} style={{ display: isInspectorVisible ? 'block' : 'none' }} />

      <Layout.Sider width={inspectorWidth} collapsedWidth={0} collapsible trigger={null} collapsed={!isInspectorVisible} className="inspector-sider-pro" theme="light">
        <Tabs defaultActiveKey="1" className="inspector-tabs-pro" tabBarExtraContent={
          <Tooltip title={isInspectorVisible ? "隐藏检查器" : "显示检查器"}>
            <Button type="text" icon={<FontAwesomeIcon icon={isInspectorVisible ? faChevronRight : faChevronLeft} />} onClick={() => setIsInspectorVisible(!isInspectorVisible)} />
          </Tooltip>
        }>
          <TabPane tab={<><FontAwesomeIcon icon={faList} /> <span className="tab-text">{t.annotations}</span> {currentCanvasAnnotations.length > 0 ? `(${currentCanvasAnnotations.length})` : ''}</>} key="1">
            <div className="tab-pane-content">
              {hasActiveImage && currentCanvasAnnotations && currentCanvasAnnotations.length > 0 ? (
                <Collapse activeKey={annotationListExpandedKeys} onChange={(keys) => setAnnotationListExpandedKeys(keys as string[])} accordion className="annotations-collapse-pro">
                  {currentCanvasAnnotations.map((item, index) => (
                    <Panel key={item.id} className="annotation-panel-item-pro"
                           header={ <Space align="center" style={{width: '100%', justifyContent: 'space-between'}}> <Space style={{minWidth: 0}}> <div className="color-indicator-pro" style={{ backgroundColor: item.color }} /> <Text className="category-name-text-pro" title={item.category} ellipsis style={{ color: item.color.replace(/[^,]+(?=\))/, '1') }}>{item.category}</Text> </Space> <Tooltip title={t.deleteAnnotationTooltip}> <Button size="small" type="text" danger icon={<FontAwesomeIcon icon={faTrash}/>} onClick={(e) => { e.stopPropagation(); removeAnnotationFromCurrentImageByIndex(index); }} disabled={selectedAnnotationSource === 'txt'} /> </Tooltip> </Space> }>
                      <div className="annotation-details-pro">
                        <Text strong>{t.originalFileNameLabel}:</Text> <Text code title={currentImageInfo?.name}>{currentImageInfo?.name}</Text><br/>
                        {('points' in item) ? ( <> <Text strong>{t.diagonalArea}</Text><br/> <Text>P1: ({item.points[0].x.toFixed(1)}, {item.points[0].y.toFixed(1)}), P2: ({item.points[1].x.toFixed(1)}, {item.points[1].y.toFixed(1)})</Text><br/> <Text>{t.thicknessLabel}: {item.thickness}px</Text> </> ) : ( <> <Text strong>{t.positionAndSize}</Text><br/> <Text>X: {item.x}, Y: {item.y}</Text><br/> <Text>W: {item.width}, H: {item.height}</Text> </> )}
                        {!('points' in item) && currentImageInfo && currentImageInfo.width > 0 && currentImageInfo.height > 0 && ( <> <br/><Text strong>{t.yoloFormatLabel}:</Text><br/> <Text code style={{wordBreak: 'break-all'}}>{viewAnnotationToYoloString(item as ViewBoxAnnotation, currentImageInfo.width, currentImageInfo.height, categories) || "N/A"}</Text> </> )}
                      </div>
                    </Panel>
                  ))}
                </Collapse>
              ) : ( <div style={{ padding: '20px', textAlign: 'center' }}> <Text type="secondary">{hasActiveImage ? t.noAnnotations : t.noImages}</Text> </div> )}
            </div>
          </TabPane>
          <TabPane tab={<><FontAwesomeIcon icon={faCog} /> <span className="tab-text">{t.settings}</span></>} key="2">
            <div className="tab-pane-content">
              <Form layout="vertical">
                <Form.Item label={t.classesFileSettings}><Button icon={<FontAwesomeIcon icon={faUpload} />} onClick={() => classesFileInputRef.current?.click()} block>{t.uploadClassesFile}</Button><input ref={classesFileInputRef} type="file" accept=".txt" onChange={handleManualClassesUpload} style={{ display: 'none' }} /></Form.Item>
                <Form.Item label={t.category}><Select value={currentCategory} onChange={setCurrentCategory} disabled={!hasActiveImage || categories.length === 0} placeholder={categories.length === 0 ? t.noCategoriesFound : "选择类别"} showSearch optionFilterProp="children" filterOption={(input, option) => (option?.children as unknown as string ?? '').toLowerCase().includes(input.toLowerCase())}>{categories.map(cat => <Option key={cat} value={cat} title={cat} style={{color: categoryColors[cat]?.replace(/[^,]+(?=\))/, '1') || 'black'}}>{cat}</Option>)}</Select></Form.Item>
                <Form.Item label={t.lineWidth}><InputNumber min={1} max={50} value={currentLineWidth} onChange={(val) => setCurrentLineWidth(val || 1)} style={{ width: '100%' }} disabled={!hasActiveImage} /></Form.Item>
                <Form.Item label={t.annotationDisplaySource}><Radio.Group onChange={(e) => setSelectedAnnotationSource(e.target.value)} value={selectedAnnotationSource} disabled={!hasActiveImage} optionType="button" buttonStyle="solid" style={{width: '100%'}}><Radio.Button style={{width: '33.33%', textAlign:'center'}} value="json">{t.sourceJson}</Radio.Button><Radio.Button style={{width: '33.33%', textAlign:'center'}} value="txt">{t.sourceTxt}</Radio.Button><Radio.Button style={{width: '33.33%', textAlign:'center'}} value="none">{t.sourceNone}</Radio.Button></Radio.Group></Form.Item>
                <Form.Item label={t.toggleAnnotationsView} valuePropName="checked"><AntSwitch checked={showAnnotationsOnCanvas} onChange={setShowAnnotationsOnCanvas} disabled={!hasActiveImage} checkedChildren={<FontAwesomeIcon icon={faEye} />} unCheckedChildren={<FontAwesomeIcon icon={faEyeSlash} />}/></Form.Item>
                <Form.Item label={t.toggleCategoryInBox} valuePropName="checked"><AntSwitch checked={showCategoryInBox} onChange={setShowCategoryInBox} disabled={!hasActiveImage} checkedChildren={<FontAwesomeIcon icon={faEye} />} unCheckedChildren={<FontAwesomeIcon icon={faEyeSlash} />}/></Form.Item>
                <Form.Item><Button danger icon={<FontAwesomeIcon icon={faEraser} />} onClick={handleClearCurrentJsonAnnotations} block disabled={!currentImageInfo || !allImageAnnotations[currentImageInfo.name]?.jsonAnnotations?.length}>{t.clearAnnotationsButton}</Button></Form.Item>
              </Form>
            </div>
          </TabPane>
        </Tabs>
      </Layout.Sider>
    </Layout>
  );
};

export default MaskOperatePro;
