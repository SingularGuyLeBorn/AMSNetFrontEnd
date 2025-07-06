import FileExplorer from "@/components/FileExplorer/index";
import VersionHistoryViewer from "@/components/VersionHistoryViewer";
import { useVersionControl } from "@/hooks/useVersionControl";
import type { FileNode, FileTreeNode } from "@/models/fileTree.tsx";
import {
  faCog,
  faDatabase,
  faDrawPolygon,
  faEraser,
  faFileExport,
  faFileImport,
  faHistory,
  faList,
  faMinusCircle,
  faMousePointer,
  faPaintBrush,
  faPlus,
  faRedo,
  faRobot,
  faSearchPlus,
  faSync,
  faTags,
  faTrash,
  faUndo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useModel } from '@umijs/max';
import { Button, Collapse, Descriptions, Divider, Flex, Form, Input, InputNumber, Layout, List, message, Modal, Radio, RadioChangeEvent, Select, Slider, Space, Switch, Tabs, Tooltip, Typography } from 'antd';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiComponent, ApiKeyPoint, ApiResponse, ApiSegment, ClassInfo, FileClassInfo, ImageAnnotationData, Point, ViewAnnotation, ViewBoxAnnotation, ViewDiagonalAnnotation } from './constants';
import { RESIZE_HANDLE_SIZE, translations } from './constants';
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;
const { TabPane } = Tabs;
const { Sider, Content, Header } = Layout;

type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete' | 'region-delete';
type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight' | 'start' | 'end';
type DraggingState = { type: 'move' | 'resize' | 'region-select' | 'magnifier-drag' | 'pan'; handle?: ResizeHandle; startMousePos: Point; startAnnotationState?: ViewAnnotation; offset?: Point; startTransform?: CanvasTransform; } | null;
type RegionSelectBox = { start: Point; end: Point; } | null;
type RegionDeleteMode = 'contain' | 'intersect';
type ImageDetails = { name: string; url: string; width: number; height: number; originalFile: File; };
interface CanvasTransform { scale: number; translateX: number; translateY: number; };
type PreviewState = { viewAnnotations: ViewAnnotation[], apiJson: ApiResponse } | null;

const MAGNIFIER_SIZE = 150; // The size of the magnifier view
const MAGNIFIER_ZOOM = 3; // The zoom level
const DIAGONAL_HANDLE_SIZE = 10;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5.0;
const ZOOM_STEP = 0.1;

const generateRandomHexColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

const findFileNodeByKey = (key: string, node: FileTreeNode): FileNode | null => {
  if (node.key === key && node.isLeaf) {
    return node as FileNode;
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
const generateUniqueId = (): string => `anno_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const convertApiToView = (apiData: ApiResponse, classMap: { [key: number]: ClassInfo }, thickness: number): { viewAnnotations: ViewAnnotation[], updatedClassMap: { [key: number]: ClassInfo } } => {
  const viewAnnotations: ViewAnnotation[] = [];
  if (!apiData) return { viewAnnotations, updatedClassMap: classMap };

  let tempClassMap = { ...classMap };
  const labelToIndex = new Map(Object.entries(tempClassMap).map(([index, info]) => [info.label, parseInt(index, 10)]));

  const getClassIndex = (label: string): number => {
    if (labelToIndex.has(label)) {
      return labelToIndex.get(label)!;
    }
    const newIndex = Object.keys(tempClassMap).length > 0 ? Math.max(...Object.keys(tempClassMap).map(Number)) + 1 : 0;
    tempClassMap[newIndex] = { label: label, color: generateRandomHexColor() };
    labelToIndex.set(label, newIndex);
    return newIndex;
  };

  const { key_points, segments } = apiData;

  if (key_points && segments) {
    const keyPointMap = new Map(key_points.map(p => [p.id, p]));
    segments.forEach((segment) => {
      const srcPoint = keyPointMap.get(segment.src_key_point_id);
      const dstPoint = keyPointMap.get(segment.dst_key_point_id);
      if (srcPoint && dstPoint && srcPoint.id !== dstPoint.id) {
        const classIndex = getClassIndex(srcPoint.net || 'unknown_net');
        viewAnnotations.push({
          id: generateUniqueId(),
          points: [{ x: srcPoint.x, y: srcPoint.y }, { x: dstPoint.x, y: dstPoint.y }],
          classIndex, thickness,
        });
      }
    });
  }

  // Bedrock V4.2.4 Fix: Removed logic for processing `cpnts` to enforce data boundaries.
  // This component now ONLY visualizes wire data (key_points and segments).

  return { viewAnnotations, updatedClassMap: tempClassMap };
};


export const convertViewToApi = (viewAnnotations: ViewAnnotation[], classMap: { [key: number]: ClassInfo }): ApiResponse => {
  const key_points: ApiKeyPoint[] = [];
  const segments: ApiSegment[] = [];
  const cpnts: ApiComponent[] = [];
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
    const categoryLabel = classMap[anno.classIndex]?.label || `class_${anno.classIndex}`;
    if ('points' in anno) {
      const srcId = getOrCreateKeyPoint(anno.points[0], categoryLabel);
      const dstId = getOrCreateKeyPoint(anno.points[1], categoryLabel);
      segments.push({ src_key_point_id: srcId, dst_key_point_id: dstId });
    } else if ('width' in anno) {
      cpnts.push({
        l: anno.x,
        t: anno.y,
        r: anno.x + anno.width,
        b: anno.y + anno.height,
        type: categoryLabel,
      });
    }
  });

  return { key_points, segments, cpnts };
};


const MaskOperate = () => {
  const { initialState } = useModel('@@initialState');
  const {
    fileTree,
    mask_currentFilePath, setMask_currentFilePath,
    mask_allImageAnnotations: allImageAnnotations, setMask_allImageAnnotations: setAllImageAnnotations,
    mask_versionHistory: versionHistory, setMask_versionHistory: setVersionHistory,
    mask_classMap: classMap, setMask_classMap: setClassMap,
    mask_selectedAnnotationId: selectedAnnotationId, setMask_selectedAnnotationId: setSelectedAnnotationId,
    mask_modifiedFiles, setMask_modifiedFiles,
  } = useModel('annotationStore');

  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];
  const [currentImageDetails, setCurrentImageDetails] = useState<ImageDetails | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  const [localAnnotations, setLocalAnnotations] = useState<ViewAnnotation[]>([]);
  const [netlistScsContent, setNetlistScsContent] = useState<string | null>(null);
  const [netlistCdlContent, setNetlistCdlContent] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [currentClassIndex, setCurrentClassIndex] = useState<number>(0);
  const [currentLineWidth, setCurrentLineWidth] = useState<number>(2);
  const [showCategoryInBox, setShowCategoryInBox] = useState<boolean>(true);

  const [leftSiderWidth, setLeftSiderWidth] = useState<number>(250);
  const [rightSiderWidth, setRightSiderWidth] = useState<number>(350);
  const [isResizingLeft, setIsResizingLeft] = useState<boolean>(false);
  const [isResizingRight, setIsResizingRight] = useState<boolean>(false);

  const [draggingState, setDraggingState] = useState<DraggingState>(null);
  const [regionSelectBox, setRegionSelectBox] = useState<RegionSelectBox | null>(null);
  const [regionDeleteMode, setRegionDeleteMode] = useState<RegionDeleteMode>('contain');
  const [canvasMousePos, setCanvasMousePos] = useState<Point>({ x: 0, y: 0 });
  const [isAiAnnotating, setIsAiAnnotating] = useState(false);
  const [isCurrentlyEditingId, setIsCurrentlyEditingId] = useState<string | null>(null);

  const [transform, setTransform] = useState<CanvasTransform>({ scale: 1, translateX: 0, translateY: 0 });
  const isSpacePressed = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const classesFileRef = useRef<HTMLInputElement>(null);

  const [isMagnifierVisible, setIsMagnifierVisible] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState<Point>({ x: 900, y: 200 });
  const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>(null);

  const hasActiveImage = !!currentImageDetails;

  const { commit, checkout, undo, redo, canUndo, canRedo, treeData, activePath } = useVersionControl<ImageAnnotationData>(
    mask_currentFilePath ? versionHistory[mask_currentFilePath] : undefined,
    (newHistory) => {
      if (mask_currentFilePath) {
        setVersionHistory(prev => ({ ...prev, [mask_currentFilePath]: newHistory }));
      }
    },
    { viewAnnotations: [], apiJson: {} }
  );

  const commitWithMessages = (summary: string, newState: ImageAnnotationData) => {
    commit(summary, newState);
    if (mask_currentFilePath) {
      setMask_modifiedFiles(prev => ({ ...prev, [mask_currentFilePath]: Date.now() }));
    }
  };

  const saveCurrentState = useCallback(() => {
    if (!mask_currentFilePath) return;
    const apiJson = convertViewToApi(localAnnotations, classMap);

    setAllImageAnnotations(prev => {
      const existingData = prev[mask_currentFilePath] || { viewAnnotations: [], apiJson: {} };
      const updatedApiJson = { ...existingData.apiJson, ...apiJson };

      const newImageData: ImageAnnotationData = {
        viewAnnotations: localAnnotations,
        apiJson: updatedApiJson,
      };

      return { ...prev, [mask_currentFilePath]: newImageData };
    });
  }, [mask_currentFilePath, localAnnotations, classMap, setAllImageAnnotations]);

  const saveFuncRef = useRef(saveCurrentState);
  saveFuncRef.current = saveCurrentState;

  useEffect(() => {
    return () => {
      saveFuncRef.current();
    };
  }, []);

  const currentViewAnnotations = useMemo(() => previewState ? previewState.viewAnnotations : localAnnotations, [previewState, localAnnotations]);
  const currentApiJson = useMemo(() => {
    if (previewState) return previewState.apiJson;
    return convertViewToApi(localAnnotations, classMap);
  }, [previewState, localAnnotations, classMap]);


  const displayApiJson = useMemo(() => {
    const apiJsonForImage = currentApiJson;
    if (apiJsonForImage) {
      const displayData = { ...apiJsonForImage };
      delete displayData.netlist_cdl;
      delete displayData.netlist_scs;
      return displayData;
    }
    return {};
  }, [currentApiJson]);

  useEffect(() => {
    if (mask_currentFilePath) {
      const imageData = allImageAnnotations[mask_currentFilePath];
      if (imageData) {
        setLocalAnnotations(imageData.viewAnnotations || []);
        setNetlistScsContent(imageData.apiJson?.netlist_scs || null);
        setNetlistCdlContent(imageData.apiJson?.netlist_cdl || null);
      } else {
        setLocalAnnotations([]);
        setNetlistScsContent(null);
        setNetlistCdlContent(null);
      }
      setTransform({ scale: 1, translateX: 0, translateY: 0 }); // Reset view on file change
      setPreviewState(null);
    } else {
      setLocalAnnotations([]);
      setNetlistScsContent(null);
      setNetlistCdlContent(null);
    }
  }, [mask_currentFilePath, allImageAnnotations]);


  const getResizeHandles = (box: ViewBoxAnnotation): { [key in ResizeHandle]?: { x: number, y: number, size: number, cursor: string } } => {
    const s = RESIZE_HANDLE_SIZE / transform.scale; // Scale handle size
    const { x, y, width, height } = box;
    return { topLeft: { x: x - s / 2, y: y - s / 2, size: s, cursor: 'nwse-resize' }, top: { x: x + width / 2 - s / 2, y: y - s / 2, size: s, cursor: 'ns-resize' }, topRight: { x: x + width - s / 2, y: y - s / 2, size: s, cursor: 'nesw-resize' }, left: { x: x - s / 2, y: y + height / 2 - s / 2, size: s, cursor: 'ew-resize' }, right: { x: x + width - s / 2, y: y + height / 2 - s / 2, size: s, cursor: 'ew-resize' }, bottomLeft: { x: x - s / 2, y: y + height - s / 2, size: s, cursor: 'nesw-resize' }, bottom: { x: x + width / 2 - s / 2, y: y + height - s / 2, size: s, cursor: 'ns-resize' }, bottomRight: { x: x + width - s / 2, y: y + height - s / 2, size: s, cursor: 'nwse-resize' }, };
  };
  const getDiagonalParameters = (points: [Point, Point]) => { const dx = points[1].x - points[0].x; const dy = points[1].y - points[0].y; return { angleRad: Math.atan2(dy, dx), length: Math.sqrt(dx * dx + dy * dy), centerX: (points[0].x + points[1].x) / 2, centerY: (points[0].y + points[1].y) / 2, }; };

  const renderRectangle = useCallback((box: ViewBoxAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    ctx.save();
    const classInfo = classMap[box.classIndex];
    if (!classInfo && !isPreview) {
      ctx.restore();
      return;
    }

    if (isPreview) {
      ctx.setLineDash([8 / transform.scale, 4 / transform.scale]);
      ctx.strokeStyle = "#4096ff"; ctx.lineWidth = 1.5 / transform.scale;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    } else {
      const hexColor = isSelected ? '#4096ff' : classInfo.color;
      const alpha = 0.4; // Default alpha for boxes

      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      const fillRgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      ctx.globalAlpha = isSelected ? 1.0 : 0.75;
      ctx.fillStyle = fillRgba;
      ctx.strokeStyle = isSelected ? "#0958d9" : "rgba(0,0,0,0.8)";
      ctx.lineWidth = (isSelected ? 3 : 1.5) / transform.scale;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      ctx.globalAlpha = 1.0;
      if (showCategoryInBox) {
        ctx.fillStyle = "#262626";
        ctx.font = `bold ${12 / transform.scale}px Arial`;
        ctx.textBaseline = "top";
        ctx.fillText(`[${box.classIndex}] ${classInfo.label}`, box.x + 4 / transform.scale, box.y + 4 / transform.scale, box.width - 8 / transform.scale);
      }
      if (isSelected && !previewState) {
        const handles = getResizeHandles(box); ctx.fillStyle = '#0958d9';
        Object.values(handles).forEach(handle => { if (handle) ctx.fillRect(handle.x, handle.y, handle.size, handle.size) });
      }
    }
    ctx.restore();
  }, [showCategoryInBox, transform.scale, classMap, previewState]);

  const renderDiagonal = useCallback((diag: ViewDiagonalAnnotation, ctx: CanvasRenderingContext2D, isPreview = false, isSelected = false) => {
    const classInfo = classMap[diag.classIndex];
    if (!classInfo && !isPreview) return;

    const { angleRad, length, centerX, centerY } = getDiagonalParameters(diag.points); if (length === 0) return;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angleRad);

    const hexColor = isSelected ? '#4096ff' : classInfo.color;
    const alpha = 0.6; // Default alpha for lines
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const fillRgba = `rgba(${r}, ${g}, ${b}, ${alpha})`;

    const lineWidth = (isSelected ? 3 : 1) / transform.scale;

    ctx.globalAlpha = isSelected ? 1.0 : 0.8;
    ctx.fillStyle = fillRgba;
    ctx.strokeStyle = isSelected ? "#0958d9" : "rgba(0,0,0,0.6)";

    if (isPreview) {
      ctx.setLineDash([8 / transform.scale, 4 / transform.scale]);
      ctx.lineWidth = 2 / transform.scale;
    } else {
      ctx.lineWidth = lineWidth;
    }

    ctx.beginPath();
    ctx.rect(-length / 2, -diag.thickness / 2, length, diag.thickness);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (isSelected && !previewState) {
      ctx.save();
      ctx.fillStyle = '#0958d9';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / transform.scale;
      const handleRadius = (DIAGONAL_HANDLE_SIZE / 2) / transform.scale;
      [diag.points[0], diag.points[1]].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    if (!isPreview && showCategoryInBox) {
      ctx.save();
      ctx.fillStyle = "#262626";
      ctx.font = `bold ${12 / transform.scale}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`[${diag.classIndex}] ${classInfo.label}`, centerX, centerY - diag.thickness / 2 - 5 / transform.scale);
      ctx.restore();
    }
  }, [showCategoryInBox, transform.scale, classMap, previewState]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (loadedImage) {
      if (canvas.width !== loadedImage.width || canvas.height !== loadedImage.height) {
        canvas.width = loadedImage.width;
        canvas.height = loadedImage.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(transform.translateX, transform.translateY);
      ctx.scale(transform.scale, transform.scale);
      if (previewState) { ctx.globalAlpha = 0.65; }

      ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);

      const currentVirtualMousePos = canvasMousePos;

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
      if (previewState) { ctx.globalAlpha = 1.0; }

      if (draggingState && (activeTool === 'rectangle' || activeTool === 'diagonal')) {
        const { startMousePos } = draggingState;
        if (activeTool === 'rectangle') {
          const previewRect: ViewBoxAnnotation = { id: 'preview', x: Math.min(startMousePos.x, currentVirtualMousePos.x), y: Math.min(startMousePos.y, currentVirtualMousePos.y), width: Math.abs(startMousePos.x - currentVirtualMousePos.x), height: Math.abs(startMousePos.y - currentVirtualMousePos.y), classIndex: currentClassIndex, sourceLineWidth: currentLineWidth };
          renderRectangle(previewRect, ctx, true);
        } else {
          const previewDiag: ViewDiagonalAnnotation = { id: 'preview', points: [startMousePos, currentVirtualMousePos], classIndex: currentClassIndex, thickness: currentLineWidth };
          renderDiagonal(previewDiag, ctx, true);
        }
      }

      if (regionSelectBox) {
        ctx.fillStyle = 'rgba(64, 150, 255, 0.3)';
        ctx.strokeStyle = 'rgba(64, 150, 255, 0.8)';
        ctx.lineWidth = 1 / transform.scale;
        const x = Math.min(regionSelectBox.start.x, regionSelectBox.end.x);
        const y = Math.min(regionSelectBox.start.y, regionSelectBox.end.y);
        const w = Math.abs(regionSelectBox.start.x - regionSelectBox.end.x);
        const h = Math.abs(regionSelectBox.start.y - regionSelectBox.end.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore(); // Restore from pan/zoom transform
    } else {
      const parent = canvas.parentElement?.parentElement; // canvas-wrapper -> canvas-content
      if (!parent) return;
      const { offsetWidth, offsetHeight } = parent;
      canvas.width = offsetWidth > 0 ? offsetWidth : 800;
      canvas.height = offsetHeight > 0 ? offsetHeight : 600;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#F0F5FF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 20px Arial"; ctx.fillStyle = "#0D1A2E"; ctx.textAlign = "center";
      ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
    }
    ctx.restore();
  }, [loadedImage, currentViewAnnotations, selectedAnnotationId, activeTool, draggingState, canvasMousePos, t.noImages, renderDiagonal, renderRectangle, currentClassIndex, currentLineWidth, regionSelectBox, transform, previewState]);

  const getVirtualCoords = useCallback((e: React.MouseEvent | { clientX: number, clientY: number }): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const invScale = 1 / transform.scale;
    return {
      x: (e.clientX - rect.left - transform.translateX) * invScale,
      y: (e.clientY - rect.top - transform.translateY) * invScale,
    };
  }, [transform]);

  const drawMagnifier = useCallback(() => {
    if (!isMagnifierVisible || !isMouseOnCanvas) return;
    const mainCanvas = canvasRef.current;
    const magCanvas = magnifierCanvasRef.current;
    if (!mainCanvas || !magCanvas) return;

    const magCtx = magCanvas.getContext('2d');
    if (!magCtx) return;

    magCtx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    magCtx.imageSmoothingEnabled = false;

    // Use virtual coordinates for the source
    const sx = canvasMousePos.x - (MAGNIFIER_SIZE / MAGNIFIER_ZOOM / 2);
    const sy = canvasMousePos.y - (MAGNIFIER_SIZE / MAGNIFIER_ZOOM / 2);

    // We need to draw the transformed image onto the magnifier
    magCtx.save();
    magCtx.scale(MAGNIFIER_ZOOM, MAGNIFIER_ZOOM);
    magCtx.translate(-sx, -sy);

    // Create a temporary canvas with the transformed main canvas content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mainCanvas.width;
    tempCanvas.height = mainCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(mainCanvas, 0, 0);
    }

    magCtx.drawImage(tempCanvas, 0, 0);
    magCtx.restore();


    // Draw crosshair
    magCtx.strokeStyle = 'red';
    magCtx.lineWidth = 1;
    magCtx.beginPath();
    magCtx.moveTo(MAGNIFIER_SIZE / 2, 0);
    magCtx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
    magCtx.moveTo(0, MAGNIFIER_SIZE / 2);
    magCtx.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
    magCtx.stroke();
  }, [isMagnifierVisible, isMouseOnCanvas, canvasMousePos, transform]);

  useEffect(() => {
    drawMagnifier();
  }, [canvasMousePos, redrawCanvas]); // Redraw magnifier when canvas updates


  useEffect(() => { setCurrentLang(initialState?.language || 'zh'); }, [initialState?.language]);

  useEffect(() => {
    // Reset state when file path changes to avoid showing stale data.
    setCurrentImageDetails(null);
    setLoadedImage(null);

    if (!mask_currentFilePath || !fileTree) {
      return;
    }

    const node = findFileNodeByKey(mask_currentFilePath, fileTree);
    if (node) {
      const url = URL.createObjectURL(node.file);
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        setCurrentImageDetails({ name: node.key, url, width: img.naturalWidth, height: img.naturalHeight, originalFile: node.file });
        setLoadedImage(img); // Store the fully loaded image object in state.
      };
      img.src = url;

      // Crucial for memory management: revoke the object URL when the component unmounts or the file changes.
      return () => { URL.revokeObjectURL(url); };
    }
  }, [mask_currentFilePath, fileTree]);


  useEffect(() => {
    const classIndexExists = currentClassIndex in classMap;
    if (Object.keys(classMap).length > 0 && !classIndexExists) {
      setCurrentClassIndex(Math.min(...Object.keys(classMap).map(Number)));
    } else if (Object.keys(classMap).length === 0) {
      setCurrentClassIndex(0);
    }
  }, [classMap, currentClassIndex]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas, localAnnotations, transform, loadedImage, previewState]);

  useEffect(() => {
    const handleResize = () => redrawCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redrawCanvas]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        isSpacePressed.current = true;
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        isSpacePressed.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
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

  const isPointInRect = (point: Point, rect: { x: number; y: number; width: number; height: number }): boolean => (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);

  const handleAnnotationPropertyUpdate = useCallback((annoId: string, updates: Partial<ViewAnnotation>) => {
    const newViewAnnotations = localAnnotations.map(a => a.id === annoId ? { ...a, ...updates } : a);
    setLocalAnnotations(newViewAnnotations);
    commitWithMessages("更新标注属性", { viewAnnotations: newViewAnnotations, apiJson: currentApiJson });
  }, [localAnnotations, currentApiJson, commitWithMessages]);

  const handleEditFocus = useCallback((annotationId: string) => {
    if (isCurrentlyEditingId !== annotationId) {
      commitWithMessages(`编辑标注 ${annotationId}`, { viewAnnotations: localAnnotations, apiJson: currentApiJson });
      setIsCurrentlyEditingId(annotationId);
    }
  }, [isCurrentlyEditingId, localAnnotations, currentApiJson, commitWithMessages]);

  const addAnnotation = useCallback((newAnnotation: ViewAnnotation, summary: string) => {
    const newAnnos = [...localAnnotations, newAnnotation];
    setLocalAnnotations(newAnnos);
    commitWithMessages(summary, { viewAnnotations: newAnnos, apiJson: convertViewToApi(newAnnos, classMap) });
  }, [localAnnotations, classMap, commitWithMessages]);

  const removeAnnotationById = useCallback((idToRemove: string) => {
    const updatedAnnotations = localAnnotations.filter(a => a.id !== idToRemove);
    setLocalAnnotations(updatedAnnotations);
    commitWithMessages(`删除标注`, { viewAnnotations: updatedAnnotations, apiJson: convertViewToApi(updatedAnnotations, classMap) });

    if (selectedAnnotationId === idToRemove) setSelectedAnnotationId(null);
    message.success(`${t.deleteAnnotationTooltip} ${t.operationSuccessful}`);
  }, [localAnnotations, classMap, selectedAnnotationId, commitWithMessages, t]);

  const handleUndo = () => {
    if (!canUndo) { message.info("没有可撤销的操作"); return; }
    const prevState = undo();
    if (prevState) {
      setLocalAnnotations(prevState.viewAnnotations);
      setNetlistScsContent(prevState.apiJson?.netlist_scs || null);
      setNetlistCdlContent(prevState.apiJson?.netlist_cdl || null);
      message.success(t.operationSuccessful);
    }
  };

  const handleRedo = () => {
    if (!canRedo) { message.info("没有可重做的操作"); return; }
    const nextState = redo();
    if (nextState) {
      setLocalAnnotations(nextState.viewAnnotations);
      setNetlistScsContent(nextState.apiJson?.netlist_scs || null);
      setNetlistCdlContent(nextState.apiJson?.netlist_cdl || null);
      message.success(t.operationSuccessful);
    }
  };

  const handleCheckout = (nodeId: string) => {
    const newState = checkout(nodeId);
    if (newState) {
      setLocalAnnotations(newState.viewAnnotations);
      setNetlistScsContent(newState.apiJson?.netlist_scs || null);
      setNetlistCdlContent(newState.apiJson?.netlist_cdl || null);
      message.success(`${t.revert} ${t.operationSuccessful}`);
    }
  };

  const handlePreview = (nodeId: string) => {
    const history = versionHistory[mask_currentFilePath!];
    const node = history?.nodes[nodeId];
    if (node) {
      setPreviewState(node.state);
    }
  };

  const handlePreviewEnd = () => setPreviewState(null);

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
    if (!currentImageDetails || !canvasRef.current || previewState || (e.button !== 0 && e.button !== 1)) return;

    if (e.button === 1 || isSpacePressed.current) {
      setDraggingState({
        type: 'pan',
        startMousePos: { x: e.clientX, y: e.clientY },
        startTransform: { ...transform },
      });
      e.preventDefault();
      return;
    }

    const mousePos = getVirtualCoords(e);
    if (activeTool === 'select') {
      const selectedAnno = localAnnotations.find(a => a.id === selectedAnnotationId);
      if (selectedAnno) {
        if ('width' in selectedAnno) {
          const handles = getResizeHandles(selectedAnno);
          const handleSize = RESIZE_HANDLE_SIZE / transform.scale;
          for (const handleKey of Object.keys(handles) as (keyof typeof handles)[]) {
            const handle = handles[handleKey]; if (handle && isPointInRect(mousePos, { x: handle.x, y: handle.y, width: handleSize, height: handleSize })) {
              setDraggingState({ type: 'resize', handle: handleKey, startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
            }
          }
        } else if ('points' in selectedAnno) {
          const handleRadius = DIAGONAL_HANDLE_SIZE / transform.scale;
          const distToStart = Math.hypot(mousePos.x - selectedAnno.points[0].x, mousePos.y - selectedAnno.points[0].y);
          const distToEnd = Math.hypot(mousePos.x - selectedAnno.points[1].x, mousePos.y - selectedAnno.points[1].y);
          if (distToStart < handleRadius) {
            setDraggingState({ type: 'resize', handle: 'start', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
          }
          if (distToEnd < handleRadius) {
            setDraggingState({ type: 'resize', handle: 'end', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(selectedAnno)) }); return;
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
        if (selectedAnnotationId !== clickedAnnotation.id) {
          setSelectedAnnotationId(clickedAnnotation.id);
        } else {
          setDraggingState({ type: 'move', startMousePos: mousePos, startAnnotationState: JSON.parse(JSON.stringify(clickedAnnotation)) });
        }
      } else {
        setSelectedAnnotationId(null);
      }
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      if (!(currentClassIndex in classMap)) { message.warning(t.noCategoriesFound); return; }
      setDraggingState({ type: 'move', startMousePos: mousePos });
    } else if (activeTool === 'region-delete') {
      setDraggingState({ type: 'region-select', startMousePos: mousePos });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const currentVirtualMousePos = getVirtualCoords(e);
    setCanvasMousePos(currentVirtualMousePos);

    if (!draggingState || !currentImageDetails) {
      return;
    }

    if (draggingState.type === 'pan' && draggingState.startTransform) {
      const dx = e.clientX - draggingState.startMousePos.x;
      const dy = e.clientY - draggingState.startMousePos.y;
      setTransform({
        scale: draggingState.startTransform.scale,
        translateX: draggingState.startTransform.translateX + dx,
        translateY: draggingState.startTransform.translateY + dy,
      });
      return;
    }

    if (draggingState.type === 'region-select') {
      setRegionSelectBox({ start: draggingState.startMousePos, end: currentVirtualMousePos });
    } else if (activeTool === 'select') {
      if (draggingState.startAnnotationState?.id) {
        const dx = currentVirtualMousePos.x - draggingState.startMousePos.x; const dy = currentVirtualMousePos.y - draggingState.startMousePos.y;
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
              if ('width' in newAnno && 'width' in startState) { // Rectangle resize
                const { handle } = draggingState; const startBox = startState;
                if (handle.includes('right')) newAnno.width = Math.max(1, startBox.width + dx);
                if (handle.includes('left')) { newAnno.x = startBox.x + dx; newAnno.width = Math.max(1, startBox.width - dx); }
                if (handle.includes('bottom')) newAnno.height = Math.max(1, startBox.height + dy);
                if (handle.includes('top')) { newAnno.y = startBox.y + dy; newAnno.height = Math.max(1, startBox.height - dy); }
              } else if ('points' in newAnno && (draggingState.handle === 'start' || draggingState.handle === 'end')) { // Diagonal resize/rotate
                if (draggingState.handle === 'start') newAnno.points[0] = currentVirtualMousePos;
                else newAnno.points[1] = currentVirtualMousePos;
              }
            }
            return newAnno;
          }
          return anno;
        });
        setLocalAnnotations(updatedAnnos);
      }
    } else {
      redrawCanvas();
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingState || e.button !== 0 && e.button !== 1) return;
    if (draggingState.type === 'pan') {
      setDraggingState(null);
      e.preventDefault();
      return;
    }

    const end = getVirtualCoords(e);

    if (activeTool === 'select') {
      commitWithMessages('移动/缩放标注', { viewAnnotations: localAnnotations, apiJson: currentApiJson });
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
          shouldDelete = (
            annoRect.x >= selRect.x &&
            annoRect.y >= selRect.y &&
            annoRect.x + annoRect.width <= selRect.x + selRect.width &&
            annoRect.y + annoRect.height <= selRect.y + selRect.height
          );
        } else { // 'intersect' mode
          shouldDelete = !(
            annoRect.x > selRect.x + selRect.width ||
            annoRect.x + annoRect.width < selRect.x ||
            annoRect.y > selRect.y + selRect.height ||
            annoRect.y + annoRect.height < selRect.y
          );
        }
        if (shouldDelete) {
          idsToDelete.add(anno.id);
        }
      });

      if (idsToDelete.size > 0) {
        const updatedAnnotations = localAnnotations.filter(a => !idsToDelete.has(a.id));
        setLocalAnnotations(updatedAnnotations);
        commitWithMessages(`区域删除 ${idsToDelete.size} 个标注`, { viewAnnotations: updatedAnnotations, apiJson: convertViewToApi(updatedAnnotations, classMap) });

        if (selectedAnnotationId && idsToDelete.has(selectedAnnotationId)) {
          setSelectedAnnotationId(null);
        }
        message.success(`删除了 ${idsToDelete.size} 个标注。`);
      }
      setRegionSelectBox(null);
    } else if (activeTool === 'rectangle' || activeTool === 'diagonal') {
      const start = draggingState.startMousePos;
      if (activeTool === 'rectangle') {
        const width = Math.abs(start.x - end.x); const height = Math.abs(start.y - end.y);
        if (width > 2 && height > 2) {
          const newRect: ViewBoxAnnotation = { id: generateUniqueId(), x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height, classIndex: currentClassIndex, sourceLineWidth: currentLineWidth };
          addAnnotation(newRect, "绘制矩形");
        }
      } else if (activeTool === 'diagonal') {
        const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        if (length > 2) {
          const newDiag: ViewDiagonalAnnotation = { id: generateUniqueId(), points: [start, end], classIndex: currentClassIndex, thickness: currentLineWidth };
          addAnnotation(newDiag, "绘制对角线");
        }
      }
    }
    setDraggingState(null);
    redrawCanvas();
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImageDetails || draggingState || previewState || e.button !== 0) return;
    const clickPos = getVirtualCoords(e);

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

  const handleZoomChange = (newScale: number) => {
    if (!canvasRef.current) return;
    const viewport = canvasRef.current.parentElement?.parentElement; // canvas -> wrapper -> content
    if (!viewport) {
      setTransform(prev => ({ ...prev, scale: newScale }));
      return;
    }
    setTransform(prev => {
      const viewportCenterX = viewport.offsetWidth / 2;
      const viewportCenterY = viewport.offsetHeight / 2;

      const newTranslateX = viewportCenterX - (viewportCenterX - prev.translateX) * (newScale / prev.scale);
      const newTranslateY = viewportCenterY - (viewportCenterY - prev.translateY) * (newScale / prev.scale);

      return {
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY,
      };
    });
  };

  const handleResetZoom = () => {
    setTransform({ scale: 1, translateX: 0, translateY: 0 });
  };


  const handleFileSelect = (filePath: string) => {
    if (filePath === mask_currentFilePath) {
      return;
    }
    saveCurrentState();
    setMask_currentFilePath(filePath);
    setSelectedAnnotationId(null);
    setDraggingState(null);
    setNetlistCdlContent(null);
    setNetlistScsContent(null);
  };

  const handleExportAll = async () => {
    if (!fileTree) { message.warning(t.noImages); return; }
    message.loading({ content: t.exportingMessage, key: 'exporting', duration: 0 });

    saveCurrentState();

    try {
      const zip = new JSZip();

      const finalAllAnnotations = allImageAnnotations;

      const addFolderToZip = (node: FileTreeNode, currentZipFolder: JSZip) => {
        if (!node.isLeaf) { // Directory
          const folder = currentZipFolder.folder(node.title);
          if (folder) node.children.forEach((child: any) => addFolderToZip(child, folder));
        } else { // File
          const fileNode = node as FileNode;
          currentZipFolder.file(fileNode.title, fileNode.file);

          const annotationsForImage = finalAllAnnotations[fileNode.key];
          const jsonContent = JSON.stringify(annotationsForImage?.apiJson || {}, null, 2);
          const baseName = fileNode.title.substring(0, fileNode.title.lastIndexOf('.'));
          currentZipFolder.file(`${baseName}.json`, jsonContent);
        }
      };

      addFolderToZip(fileTree, zip);

      const zipContent = await zip.generateAsync({ type: "blob" });
      saveAs(zipContent, "maskoperate_annotations.zip");
      message.success({ content: t.exportSuccessMessage, key: 'exporting', duration: 3 });
    } catch (error: any) {
      console.error("Export failed:", error);
      message.error({ content: `${t.exportFailureMessage} ${error.message}`, key: 'exporting', duration: 3 });
    }
  };

  const handleAiAnnotation = async () => {
    if (!currentImageDetails || !mask_currentFilePath) { message.warning(t.noImages); return; }

    setIsAiAnnotating(true);
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
        } catch (e) {
          errorDetail = errorText || errorDetail;
        }
        throw new Error(errorDetail);
      }
      const apiResult: ApiResponse = await response.json();

      if ((!apiResult.key_points || !apiResult.segments) && !apiResult.cpnts) {
        message.info({ content: "AI 未返回任何有效标注。", key: 'ai-annotation', duration: 3 });
        setIsAiAnnotating(false);
        return;
      }

      setNetlistScsContent(apiResult.netlist_scs || null);
      setNetlistCdlContent(apiResult.netlist_cdl || null);

      const { viewAnnotations: finalViewAnnotations, updatedClassMap } = convertApiToView(apiResult, classMap, currentLineWidth);

      setClassMap(updatedClassMap);
      setLocalAnnotations(finalViewAnnotations);
      commitWithMessages('AI 自动标注', { viewAnnotations: finalViewAnnotations, apiJson: apiResult });

      message.success({ content: `${t.operationSuccessful}: ${finalViewAnnotations.length} annotations loaded.`, key: 'ai-annotation', duration: 3 });

    } catch (error: any) {
      console.error("AI Annotation failed:", error);
      message.error({ content: `${t.aiFailed}: ${error.message}`, key: 'ai-annotation', duration: 5 });
    } finally {
      setIsAiAnnotating(false);
    }
  };

  const handleAddClass = () => { const existingIndices = Object.keys(classMap).map(Number); const newIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0; setClassMap(prev => ({ ...prev, [newIndex]: { label: 'new_class', color: generateRandomHexColor() } })); };
  const handleUpdateClass = (index: number, field: 'label' | 'color', value: string) => { setClassMap(prev => ({ ...prev, [index]: { ...prev[index], [field]: value } })); };

  const handleDeleteClass = (indexToDelete: number) => {
    const title = t.deleteClassConfirmTitle.replace('%s', `[${indexToDelete}] ${classMap[indexToDelete]?.label}`);
    Modal.confirm({
      title: title,
      content: t.deleteClassConfirmContent,
      okText: t.confirmDelete,
      cancelText: t.cancel,
      okType: 'danger',
      onOk: () => {
        const updatedAnnotations: Record<string, ImageAnnotationData> = {};
        const modifiedFileKeys: Record<string, number> = {};
        const now = Date.now();

        Object.entries(allImageAnnotations).forEach(([filePath, imageData]) => {
          let fileWasModified = false;
          const newViewAnnotations = imageData.viewAnnotations.map(anno => {
            if (anno.classIndex === indexToDelete) {
              fileWasModified = true;
              return null;
            }
            if (anno.classIndex > indexToDelete) {
              fileWasModified = true;
              return { ...anno, classIndex: anno.classIndex - 1 };
            }
            return anno;
          }).filter((anno): anno is ViewAnnotation => anno !== null);

          if (fileWasModified) {
            const newApiJson = convertViewToApi(newViewAnnotations, classMap);
            updatedAnnotations[filePath] = { viewAnnotations: newViewAnnotations, apiJson: { ...imageData.apiJson, ...newApiJson } };
            modifiedFileKeys[filePath] = now;
          }
        });

        setAllImageAnnotations(prev => ({ ...prev, ...updatedAnnotations }));
        setMask_modifiedFiles(prev => ({ ...prev, ...modifiedFileKeys }));
        if (mask_currentFilePath && updatedAnnotations[mask_currentFilePath]) {
          setLocalAnnotations(updatedAnnotations[mask_currentFilePath].viewAnnotations);
        }

        const newClassMap: { [key: number]: ClassInfo } = {};
        Object.entries(classMap).forEach(([idxStr, info]) => {
          const idx = parseInt(idxStr, 10);
          if (idx < indexToDelete) newClassMap[idx] = info;
          else if (idx > indexToDelete) newClassMap[idx - 1] = info;
        });

        setClassMap(newClassMap);

        if (currentClassIndex === indexToDelete) {
          setCurrentClassIndex(Object.keys(newClassMap).length > 0 ? Math.min(...Object.keys(newClassMap).map(Number)) : 0);
        } else if (currentClassIndex > indexToDelete) {
          setCurrentClassIndex(currentClassIndex - 1);
        }

        message.success(t.classDeleted.replace('%s', classMap[indexToDelete]?.label || ''));
      }
    });
  };

  const handleExportClasses = () => {
    const exportData: FileClassInfo[] = Object.entries(classMap).map(([index, { label, color }]) => ({
      index: parseInt(index, 10),
      label,
      color,
    }));
    const classText = JSON.stringify(exportData, null, 2);
    const blob = new Blob([classText], { type: 'application/json;charset=utf-8' });
    saveAs(blob, 'mask_classes.json');
  };

  const handleImportClasses = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const importedData: FileClassInfo[] = JSON.parse(text);

        if (!Array.isArray(importedData) || !importedData.every(item => typeof item.index === 'number' && typeof item.label === 'string' && typeof item.color === 'string')) {
          throw new Error("Invalid file format. Expected an array of {index, label, color}.");
        }

        Modal.confirm({
          title: t.importClassConfirmTitle,
          content: t.importClassConfirmContent,
          okText: t.confirmImport,
          cancelText: t.cancel,
          onOk: () => {
            const newClassMap: { [key: number]: ClassInfo } = {};
            importedData.forEach(item => {
              newClassMap[item.index] = { label: item.label, color: item.color };
            });
            setClassMap(newClassMap);
            setCurrentClassIndex(Object.keys(newClassMap).length > 0 ? Math.min(...Object.keys(newClassMap).map(Number)) : 0);
            message.success(`Successfully imported ${importedData.length} classes.`);
          },
        });

      } catch (error: any) {
        console.error("Failed to import classes:", error);
        message.error(`Failed to import classes: ${error.message}`);
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearAnnotations = () => {
    if (!currentImageDetails || localAnnotations.length === 0) return;
    setLocalAnnotations([]);
    commitWithMessages('清空所有标注', { viewAnnotations: [], apiJson: currentApiJson });
    setSelectedAnnotationId(null); message.success(t.clearAnnotationsButton + ' ' + t.operationSuccessful);
  };

  const isSelectedForEdit = (item: ViewAnnotation) => activeTool === 'select' && item.id === selectedAnnotationId && !previewState;

  const getCanvasCursor = () => {
    if (previewState) return 'default';
    if (draggingState?.type === 'pan' || isSpacePressed.current) return 'panning';
    if (isMagnifierVisible) return 'none';
    switch (activeTool) {
      case 'delete': return 'delete-cursor';
      case 'rectangle':
      case 'diagonal':
      case 'region-delete': return 'draw-cursor';
      default: return 'grab';
    }
  }

  const selectedAnnotation = useMemo(() => {
    if (!selectedAnnotationId) return null;
    return localAnnotations.find(a => a.id === selectedAnnotationId) || null;
  }, [selectedAnnotationId, localAnnotations]);

  return (
    <Layout className="unified-layout">
      <Header className="unified-top-header">
        <div className="header-left-controls">
          <Space>
            <Tooltip title={`缩放: ${Math.round(transform.scale * 100)}%`}>
              <Slider
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={transform.scale}
                onChange={handleZoomChange}
                style={{ width: 150 }}
                disabled={!hasActiveImage}
              />
            </Tooltip>
            <Tooltip title="重置视图">
              <Button
                icon={<FontAwesomeIcon icon={faSync} />}
                onClick={handleResetZoom}
                disabled={!hasActiveImage}
              />
            </Tooltip>
          </Space>
          <Text className="current-file-text" title={currentImageDetails?.name}>{currentImageDetails ? `${t.currentImage}: ${currentImageDetails.name}` : t.noImages}</Text>
        </div>
        <Space className="header-center-controls">
          <Tooltip title={t.selectTool} placement="bottom"><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faMousePointer} />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.magnifier} placement="bottom"><Button onClick={() => setIsMagnifierVisible(p => !p)} type={isMagnifierVisible ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faSearchPlus} />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.rectTool} placement="bottom"><Button onClick={() => setActiveTool('rectangle')} type={activeTool === 'rectangle' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faPaintBrush} />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.diagonalTool} placement="bottom"><Button onClick={() => setActiveTool('diagonal')} type={activeTool === 'diagonal' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faDrawPolygon} />} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.deleteTool} placement="bottom"><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} disabled={!hasActiveImage} /></Tooltip>
          <Tooltip title={t.regionDelete} placement="bottom"><Button onClick={() => setActiveTool('region-delete')} type={activeTool === 'region-delete' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faEraser} />} danger={activeTool === 'region-delete'} disabled={!hasActiveImage} /></Tooltip>
          <Divider type="vertical" />
          <Tooltip title={t.aiAnnotate} placement="bottom"><Button onClick={handleAiAnnotation} type="text" icon={<FontAwesomeIcon icon={faRobot} />} loading={isAiAnnotating} disabled={!hasActiveImage || isAiAnnotating} /></Tooltip>
        </Space>
        <div className="header-right-controls">
          <Tooltip title={t.undo}><Button icon={<FontAwesomeIcon icon={faUndo} />} onClick={handleUndo} disabled={!canUndo} /></Tooltip>
          <Tooltip title={t.redo}><Button icon={<FontAwesomeIcon icon={faRedo} />} onClick={handleRedo} disabled={!canRedo} /></Tooltip>
          <Button type="primary" icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportAll} ghost disabled={!fileTree}>{t.exportAll}</Button>
        </div>
      </Header>
      <Layout hasSider>
        <Sider width={leftSiderWidth} className="file-explorer-sider" theme="light">
          <FileExplorer onFileSelect={handleFileSelect} activeFilePath={mask_currentFilePath} modifiedFiles={mask_modifiedFiles} />
        </Sider>
        <div className="resizer-horizontal" onMouseDown={() => setIsResizingLeft(true)} />

        <Layout className="main-content-wrapper">
          <Content
            className={`canvas-content ${draggingState?.type === 'pan' || isSpacePressed.current ? 'panning' : ''}`}
            onMouseEnter={() => setIsMouseOnCanvas(true)}
            onMouseLeave={() => { setIsMouseOnCanvas(false); handlePreviewEnd(); }}
          >
            <div className={`canvas-wrapper`}>
              <canvas ref={canvasRef} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onClick={handleCanvasClick} className={getCanvasCursor()} />
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
                  overflow: 'hidden',
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
        <Sider width={rightSiderWidth} className="unified-inspector-sider" theme="light">
          <Tabs defaultActiveKey="1" className="inspector-tabs">
            <TabPane tab={<Tooltip title={t.annotations} placement="bottom"><FontAwesomeIcon icon={faList} /></Tooltip>} key="1">
              <div className="tab-pane-content">
                <div className="inspector-tab-wrapper">
                  <Title level={5} style={{ margin: 0, flexShrink: 0 }}>{t.annotations}</Title>
                  {hasActiveImage && currentViewAnnotations.length > 0 ? (
                    <div className="annotation-list-wrapper">
                      <Collapse accordion activeKey={previewState ? undefined : selectedAnnotationId || undefined} onChange={(key) => { const newKey = Array.isArray(key) ? key[0] : (typeof key === 'string' ? key : null); setSelectedAnnotationId(newKey); setIsCurrentlyEditingId(null); }} ghost className="annotation-collapse-container">
                        {currentViewAnnotations.map((item) => (
                          <Panel key={item.id} className="annotation-panel-item" header={
                            <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                              <Space onClick={(e) => e.stopPropagation()}>
                                <div className="color-indicator" style={{ backgroundColor: classMap[item.classIndex]?.color || '#808080' }} />
                                <Text className="category-name-text" title={classMap[item.classIndex]?.label} ellipsis>{`[${item.classIndex}] ${classMap[item.classIndex]?.label || '未知类别'}`}</Text>
                              </Space>
                              <Tooltip title={t.deleteAnnotationTooltip}><Button size="small" type="text" danger icon={<FontAwesomeIcon icon={faTrash} />} disabled={!!previewState} onClick={(e) => { e.stopPropagation(); removeAnnotationById(item.id); }} /></Tooltip>
                            </Flex>}>
                            {selectedAnnotation?.id === item.id && !previewState && (
                              <Descriptions bordered size="small" column={1} className="annotation-details">
                                {'width' in selectedAnnotation ? (
                                  <>
                                    <Descriptions.Item label="Type">Rectangle</Descriptions.Item>
                                    <Descriptions.Item label="X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={selectedAnnotation.x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { x: v || 0 })} /> : selectedAnnotation.x.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label="Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={selectedAnnotation.y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { y: v || 0 })} /> : selectedAnnotation.y.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label="Width">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={selectedAnnotation.width} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { width: v || 1 })} /> : selectedAnnotation.width.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label="Height">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={selectedAnnotation.height} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { height: v || 1 })} /> : selectedAnnotation.height.toFixed(1)}</Descriptions.Item>
                                  </>
                                ) : (
                                  <>
                                    <Descriptions.Item label="Type">Diagonal</Descriptions.Item>
                                    <Descriptions.Item label="P1.X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={selectedAnnotation.points[0].x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [{ ...selectedAnnotation.points[0], x: v || 0 }, selectedAnnotation.points[1]] })} /> : selectedAnnotation.points[0].x.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label="P1.Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={selectedAnnotation.points[0].y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [{ ...selectedAnnotation.points[0], y: v || 0 }, selectedAnnotation.points[1]] })} /> : selectedAnnotation.points[0].y.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label="P2.X">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={selectedAnnotation.points[1].x} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [selectedAnnotation.points[0], { ...selectedAnnotation.points[1], x: v || 0 }] })} /> : selectedAnnotation.points[1].x.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label="P2.Y">{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} value={selectedAnnotation.points[1].y} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { points: [selectedAnnotation.points[0], { ...selectedAnnotation.points[1], y: v || 0 }] })} /> : selectedAnnotation.points[1].y.toFixed(1)}</Descriptions.Item>
                                    <Descriptions.Item label={t.thicknessLabel}>{isSelectedForEdit(item) ? <InputNumber className="annotation-details-input" controls={false} min={1} value={selectedAnnotation.thickness} onFocus={() => handleEditFocus(item.id)} onChange={(v) => handleAnnotationPropertyUpdate(item.id, { thickness: v || 1 })} /> : selectedAnnotation.thickness}</Descriptions.Item>
                                  </>
                                )}
                              </Descriptions>
                            )}
                          </Panel>
                        ))}
                      </Collapse>
                    </div>
                  ) : <Text type="secondary" style={{ textAlign: 'center', display: 'block', paddingTop: '20px' }}>{hasActiveImage ? t.noAnnotations : t.noImages}</Text>}
                </div>
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.rawData} placement="bottom"><FontAwesomeIcon icon={faDatabase} /></Tooltip>} key="4">
              <div className="tab-pane-content">
                <div className="data-view-container">
                  <Tabs type="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <TabPane tab="Core Data (.json)" key="json-data">
                      <div className="data-view-item" style={{ height: '100%' }}>
                        <textarea
                          className="data-content-textarea"
                          readOnly
                          value={JSON.stringify(displayApiJson, null, 2)}
                          placeholder="Key points and segments data will be shown here."
                        />
                      </div>
                    </TabPane>
                    <TabPane tab="Netlist (.scs)" key="scs-data">
                      <div className="data-view-item" style={{ height: '100%' }}>
                        <textarea
                          className="data-content-textarea"
                          readOnly
                          value={netlistScsContent || ""}
                          placeholder="Netlist (SCS format) will be shown here after processing."
                        />
                      </div>
                    </TabPane>
                    <TabPane tab="Netlist (.cdl)" key="cdl-data">
                      <div className="data-view-item" style={{ height: '100%' }}>
                        <textarea
                          className="data-content-textarea"
                          readOnly
                          value={netlistCdlContent || ""}
                          placeholder="Netlist (CDL format) will be shown here after processing."
                        />
                      </div>
                    </TabPane>
                  </Tabs>
                </div>
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.history} placement="bottom"><FontAwesomeIcon icon={faHistory} /></Tooltip>} key="5">
              <div className="tab-pane-content">
                <div className="inspector-tab-wrapper">
                  <Title level={5} style={{ margin: 0, flexShrink: 0 }}>{t.history}</Title>
                  <VersionHistoryViewer
                    treeData={treeData}
                    activePath={activePath}
                    onCheckout={handleCheckout}
                    onPreview={handlePreview}
                    onPreviewEnd={handlePreviewEnd}
                    revertText={t.revert}
                    cancelText={t.cancel}
                    revertConfirmTitle={t.revertConfirmTitle}
                  />
                </div>
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.classManagement} placement="bottom"><FontAwesomeIcon icon={faTags} /></Tooltip>} key="2">
              <div className="tab-pane-content">
                <div className="inspector-tab-wrapper">
                  <Flex justify="space-between" align="center" style={{ width: '100%', flexShrink: 0 }}>
                    <Title level={5} style={{ margin: 0 }}>{t.classManagement}</Title>
                    <Space.Compact>
                      <Tooltip title={t.importClasses || "Import Classes"}><Button icon={<FontAwesomeIcon icon={faFileImport} />} onClick={() => classesFileRef.current?.click()} /></Tooltip>
                      <Tooltip title={t.exportClasses || "Export Classes"}><Button icon={<FontAwesomeIcon icon={faFileExport} />} onClick={handleExportClasses} /></Tooltip>
                    </Space.Compact>
                  </Flex>
                  <input ref={classesFileRef} type="file" accept=".json" onChange={handleImportClasses} style={{ display: 'none' }} />
                  <div className="class-list-container">
                    <List size="small" dataSource={Object.entries(classMap)} renderItem={([idx, { label, color }]) => { const index = parseInt(idx); return (<List.Item><div className="class-management-item"><Input type="color" value={color} onChange={(e) => handleUpdateClass(index, 'color', e.target.value)} className="color-picker-input" /><Input value={label} onChange={(e) => handleUpdateClass(index, 'label', e.target.value)} placeholder={t.className} /><Tooltip title={t.delete || "Delete"}><Button icon={<FontAwesomeIcon icon={faMinusCircle} />} onClick={() => handleDeleteClass(index)} danger /></Tooltip></div></List.Item>); }} />
                  </div>
                  <Button icon={<FontAwesomeIcon icon={faPlus} />} onClick={handleAddClass} block style={{ flexShrink: 0 }}>{t.addClass}</Button>
                </div>
              </div>
            </TabPane>
            <TabPane tab={<Tooltip title={t.settings} placement="bottom"><FontAwesomeIcon icon={faCog} /></Tooltip>} key="3">
              <div className="tab-pane-content" style={{ justifyContent: 'flex-start' }}>
                <Form layout="vertical" style={{ width: '100%' }}>
                  <Title level={5}>{t.viewSettings || 'View & Annotation Settings'}</Title>
                  <Form.Item label={t.category}>
                    <Select
                      value={currentClassIndex}
                      onChange={(value: number) => setCurrentClassIndex(value)}
                      disabled={!hasActiveImage || Object.keys(classMap).length === 0}
                      placeholder={t.noCategoriesFound}
                    >
                      {Object.entries(classMap).map(([idx, { label, color }]) =>
                        <Option key={idx} value={parseInt(idx)}>
                          <Space>
                            <div style={{ width: '14px', height: '14px', backgroundColor: color, borderRadius: '3px', border: '1px solid #ccc' }} />
                            {`[${idx}] ${label}`}
                          </Space>
                        </Option>
                      )}
                    </Select>
                  </Form.Item>
                  <Form.Item label={t.lineWidth}><InputNumber min={1} max={50} value={currentLineWidth} onChange={(val) => setCurrentLineWidth(val || 1)} style={{ width: '100%' }} disabled={!hasActiveImage} /></Form.Item>
                  <Form.Item label={t.toggleCategoryInBox} valuePropName="checked"><Switch checked={showCategoryInBox} onChange={setShowCategoryInBox} /></Form.Item>
                  <Divider />
                  <Title level={5}>{t.regionDelete}</Title>
                  <Form.Item label={t.regionDeleteMode}>
                    <Radio.Group onChange={(e: RadioChangeEvent) => setRegionDeleteMode(e.target.value)} value={regionDeleteMode} disabled={!hasActiveImage}>
                      <Radio.Button value="contain">{t.fullyContained}</Radio.Button>
                      <Radio.Button value="intersect">{t.intersecting}</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                  <Divider />
                  <Form.Item><Button danger icon={<FontAwesomeIcon icon={faEraser} />} onClick={handleClearAnnotations} block disabled={!hasActiveImage || localAnnotations.length === 0}>{t.clearAnnotationsButton}</Button></Form.Item>
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