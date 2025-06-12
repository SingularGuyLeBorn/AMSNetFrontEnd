// index.tsx

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useModel } from 'umi';
import { Card, Button, Select, InputNumber, Layout, message, Typography, List, Collapse, Space, Tooltip, Form } from 'antd';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload, faChevronLeft, faChevronRight, faUndo,
  faSave, faDrawPolygon, faTrash, faPaintBrush, faArrowsAltH,
  faCog, faList, faMousePointer
} from "@fortawesome/free-solid-svg-icons";
import { categoryColors } from "./Styles/constants.js";
import './index.css';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Option } = Select;

// ===================================================================
// 接口与类型定义 (Interfaces & Type Definitions)
// ===================================================================
type Point = { x: number; y: number };
type Box = {
  x: number; y: number; width: number; height: number;
  category: string; color: string; lineWidth: number;
};
type Diagonal = {
  points: [Point, Point];
  category: string; color: string;
};
type Annotation = Box | Diagonal;
type UndoOperation = { type: 'add_annotation'; data: Annotation };
type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete';

// ===================================================================
// 国际化文本 (i18n Translations)
// ===================================================================
const translations = {
  zh: {
    uploadFolder: "上传", undo: "撤销", exportJSON: "导出",
    previous: "上一张", next: "下一张", currentImage: "当前:",
    annotations: "标注列表", tools: "工具", settings: "设置",
    noAnnotations: "当前图片无标注", noImages: "请先上传文件夹",
    category: "类别", lineWidth: "线宽",
    selectTool: "选择/移动", rectTool: "矩形工具", diagonalTool: "斜线工具", deleteTool: "删除工具",
    showSettings: "显示设置", showAnnotations: "显示列表",
    imageSize: "图像尺寸", mouseCoords: "鼠标坐标",
    diagonalArea: "斜线区域", positionAndSize: "位置与尺寸",
  },
  en: {
    uploadFolder: "Upload", undo: "Undo", exportJSON: "Export",
    previous: "Previous", next: "Next", currentImage: "Current:",
    annotations: "Annotations", tools: "Tools", settings: "Settings",
    noAnnotations: "No annotations for this image", noImages: "Please upload a folder first",
    category: "Category", lineWidth: "Line Width",
    selectTool: "Select/Move", rectTool: "Rectangle", diagonalTool: "Diagonal", deleteTool: "Delete",
    showSettings: "Show Settings", showAnnotations: "Show List",
    imageSize: "Image Size", mouseCoords: "Mouse Coords",
    diagonalArea: "Diagonal Area", positionAndSize: "Position & Size",
  }
};

// ===================================================================
// 主组件 (Main Component)
// ===================================================================
const MaskOperate = () => {
  // --- 状态管理 (State Management) ---
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];

  const [images, setImages] = useState<{name: string, url: string}[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageBoxes, setImageBoxes] = useState<{[key: string]: Annotation[]}>({});

  const [activeTool, setActiveTool] = useState<ActiveTool>('rectangle');
  const [currentCategory, setCurrentCategory] = useState("Net 1");
  const [lineWidth, setLineWidth] = useState(12);

  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(true);

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPosition, setStartPosition] = useState<Point | null>(null);
  const [diagonalPoints, setDiagonalPoints] = useState<Point[]>([]);

  const [undoHistory, setUndoHistory] = useState<UndoOperation[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[] | number[]>([]);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [mousePosition, setMousePosition] = useState<Point>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // 创建一个ref来引用文件输入元素

  // --- 派生状态与常量 (Derived State & Constants) ---
  const hasImages = images.length > 0;
  const currentImage = images[currentImageIndex];
  const currentBoxes = currentImage ? (imageBoxes[currentImage.name] || []) : [];
  const categories = Object.keys(categoryColors);

  // --- 副作用钩子 (useEffect Hooks) ---
  useEffect(() => {
    drawCanvas();
  }, [imageBoxes, currentImage]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      setMousePosition({
        x: Math.round((e.clientX - rect.left) * scaleX),
        y: Math.round((e.clientY - rect.top) * scaleY)
      });
    };
    const wrapper = canvas.parentElement;
    wrapper?.addEventListener('mousemove', handleMouseMove);
    return () => wrapper?.removeEventListener('mousemove', handleMouseMove);
  }, [hasImages, currentImage]);


  // --- 核心功能函数 (Core Functions) ---
  const drawCanvas = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    if (currentImage) {
      const img = new Image();
      img.src = currentImage.url;
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        ctx.drawImage(img, 0, 0);
        (imageBoxes[currentImage.name] || []).forEach(box => {
          if ('points' in box) drawDiagonalRegion(box as Diagonal);
          else drawRectangleBox(box as Box);
        });
      };
      if (img.complete) img.onload();
    } else {
      canvas.width = 800; canvas.height = 600;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#eef2f7"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "20px Arial"; ctx.fillStyle = "#6b7280"; ctx.textAlign = "center";
      ctx.fillText(t.noImages, canvas.width / 2, canvas.height / 2);
    }
  };

  const drawRectangleBox = (box: Box) => {
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = box.color; ctx.strokeStyle = "black"; ctx.lineWidth = box.lineWidth || 1;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  };

  const drawDiagonalRegion = (box: Diagonal) => {
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const { angle, width, centerX, centerY } = calculateRotationParams(box.points);
    ctx.save();
    ctx.translate(centerX, centerY); ctx.rotate(angle);
    ctx.beginPath(); ctx.rect(-width / 2, -lineWidth / 2, width, lineWidth);
    ctx.fillStyle = box.color || "rgba(128, 128, 128, 0.3)";
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  const calculateRotationParams = (points: [Point, Point]) => {
    const dx = points[1].x - points[0].x; const dy = points[1].y - points[0].y;
    return {
      angle: Math.atan2(dy, dx),
      width: Math.sqrt(dx * dx + dy * dy),
      centerX: (points[0].x + points[1].x) / 2,
      centerY: (points[0].y + points[1].y) / 2,
    };
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const imageFiles = files.filter(f => f.type.match(/image\/(jpeg|png)/));
    const jsonFiles = files.filter(f => f.name.endsWith(".json"));
    const sortedImages = imageFiles
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(file => ({ name: file.name, url: URL.createObjectURL(file) }));

    setImages(sortedImages); setCurrentImageIndex(0); setUndoHistory([]);

    const initialBoxes: {[key: string]: Annotation[]} = {};
    sortedImages.forEach(img => { initialBoxes[img.name] = []; });

    const jsonPromises = jsonFiles.map(jsonFile => new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target!.result as string);
          const imgName = jsonFile.name.replace(/\.json$/, '.jpg');
          if (initialBoxes.hasOwnProperty(imgName)) {
            initialBoxes[imgName] = jsonData.map((box: any) => ({ ...box, color: categoryColors[box.category] || "#808080" }));
          }
          resolve();
        } catch (error) { reject(new Error(`解析JSON失败 ${jsonFile.name}: ${error}`)); }
      };
      reader.onerror = () => reject(new Error(`读取文件失败 ${jsonFile.name}`));
      reader.readAsText(jsonFile);
    }));

    try {
      await Promise.all(jsonPromises);
      setImageBoxes(initialBoxes);
    } catch (error) { message.error((error as Error).message); }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hasImages) return;
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX, y = (e.clientY - rect.top) * scaleY;

    if (activeTool === 'delete') {
      const boxIndexToRemove = findBoxIndexByPoint(x, y);
      if (boxIndexToRemove > -1) {
        const newBoxes = [...currentBoxes]; newBoxes.splice(boxIndexToRemove, 1);
        setImageBoxes(prev => ({ ...prev, [currentImage.name]: newBoxes }));
      }
    } else if (activeTool === 'diagonal') {
      const newPoints = [...diagonalPoints, { x, y }]; setDiagonalPoints(newPoints);
      if (newPoints.length === 2) {
        const newDiagonal: Diagonal = {
          points: newPoints.map(p => ({ x: parseFloat(p.x.toFixed(2)), y: parseFloat(p.y.toFixed(2)) })) as [Point, Point],
          category: currentCategory, color: categoryColors[currentCategory],
        };
        addAnnotation(newDiagonal); setDiagonalPoints([]);
      }
    } else if (activeTool === 'rectangle') {
      if (!isDrawing) { setStartPosition({x, y}); setIsDrawing(true); }
      else {
        const endPosition = { x, y };
        const dx = Math.abs(endPosition.x - startPosition!.x), dy = Math.abs(endPosition.y - startPosition!.y);
        let boxX, boxY, boxWidth, boxHeight;
        if (dy < 5) {
          boxX = Math.min(startPosition!.x, endPosition.x); boxY = (startPosition!.y + endPosition.y) / 2 - lineWidth / 2;
          boxWidth = dx; boxHeight = lineWidth;
        } else if (dx < 5) {
          boxX = (startPosition!.x + endPosition.x) / 2 - lineWidth / 2; boxY = Math.min(startPosition!.y, endPosition.y);
          boxWidth = lineWidth; boxHeight = dy;
        } else {
          boxX = Math.min(startPosition!.x, endPosition.x); boxY = Math.min(startPosition!.y, endPosition.y);
          boxWidth = dx; boxHeight = dy;
        }
        const newBox: Box = {
          x: parseFloat(boxX.toFixed(2)), y: parseFloat(boxY.toFixed(2)),
          width: parseFloat(boxWidth.toFixed(2)), height: parseFloat(boxHeight.toFixed(2)),
          category: currentCategory, color: categoryColors[currentCategory], lineWidth: 0.3
        };
        addAnnotation(newBox); setIsDrawing(false); setStartPosition(null);
      }
    }
  };

  const findBoxIndexByPoint = (x: number, y: number): number => {
    for (let i = currentBoxes.length - 1; i >= 0; i--) {
      const box = currentBoxes[i];
      if ('points' in box) {
        const { points } = box as Diagonal;
        const { angle, width, centerX, centerY } = calculateRotationParams(points);
        const px = x - centerX, py = y - centerY;
        const xr = px * Math.cos(angle) + py * Math.sin(angle);
        const yr = -px * Math.sin(angle) + py * Math.cos(angle);
        if (Math.abs(xr) <= width / 2 && Math.abs(yr) <= lineWidth / 2) return i;
      } else {
        const b = box as Box;
        if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return i;
      }
    }
    return -1;
  };

  const addAnnotation = (annotation: Annotation) => {
    const newBoxes = [...currentBoxes, annotation];
    setImageBoxes(prev => ({ ...prev, [currentImage.name]: newBoxes }));
    setUndoHistory(prev => [...prev, { type: 'add_annotation', data: annotation }]);
  };

  const handleUndo = () => {
    if (undoHistory.length === 0) { message.info("没有可撤销的操作"); return; }
    setUndoHistory(prev => prev.slice(0, -1));
    setImageBoxes(prev => ({ ...prev, [currentImage.name]: currentBoxes.slice(0, -1) }));
    message.success("撤销成功");
  };

  const handleExport = () => {
    if (!hasImages || !currentImage) { message.warn("没有可导出的数据"); return; }
    const dataToExport = currentBoxes.map(({ color, ...rest }) => rest);
    const jsonContent = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${currentImage.name.split(".")[0]}.json`;
    link.click();
  };

  const switchImage = (offset: number) => {
    const newIndex = currentImageIndex + offset;
    if (newIndex >= 0 && newIndex < images.length) {
      setCurrentImageIndex(newIndex); setUndoHistory([]); setExpandedKeys([]);
    }
  };

  return (
    <div className="mask-operate-app">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} onClick={handleCanvasClick} className={`drawing-canvas ${activeTool === 'delete' ? 'deleting-mode' : ''}`}/>
      </div>

      <div className="top-toolbar">
        <div className="tool-group">
          {/* 关键修复：将隐藏的input元素放在这里，并使用ref来触发点击 */}
          <Button type="primary" onClick={() => fileInputRef.current?.click()} icon={<FontAwesomeIcon icon={faUpload} />}>{t.uploadFolder}</Button>
          <input ref={fileInputRef} type="file" webkitdirectory="true" directory="true" multiple onChange={handleFolderUpload} className="file-input-hidden" />
        </div>
        <div className="tool-group">
          <Button onClick={() => switchImage(-1)} disabled={!hasImages || currentImageIndex === 0} icon={<FontAwesomeIcon icon={faChevronLeft} />} />
          <Button onClick={() => switchImage(1)} disabled={!hasImages || currentImageIndex >= images.length - 1} icon={<FontAwesomeIcon icon={faChevronRight} />} />
        </div>
        <div className="tool-group">
          <Tooltip title={t.selectTool}><Button onClick={() => setActiveTool('select')} type={activeTool === 'select' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faMousePointer} />} /></Tooltip>
          <Tooltip title={t.rectTool}><Button onClick={() => setActiveTool('rectangle')} type={activeTool === 'rectangle' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faPaintBrush} />} /></Tooltip>
          <Tooltip title={t.diagonalTool}><Button onClick={() => setActiveTool('diagonal')} type={activeTool === 'diagonal' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faDrawPolygon} />} /></Tooltip>
          <Tooltip title={t.deleteTool}><Button onClick={() => setActiveTool('delete')} type={activeTool === 'delete' ? 'primary' : 'text'} icon={<FontAwesomeIcon icon={faTrash} />} danger={activeTool === 'delete'} /></Tooltip>
        </div>
        <div className="tool-group">
          <Button onClick={handleUndo} disabled={undoHistory.length === 0} icon={<FontAwesomeIcon icon={faUndo} />}>{t.undo}</Button>
          <Button onClick={handleExport} disabled={!hasImages} icon={<FontAwesomeIcon icon={faSave} />}>{t.exportJSON}</Button>
        </div>
        <div className="tool-group">
          <Tooltip title={t.showSettings}><Button onClick={() => setIsLeftPanelVisible(!isLeftPanelVisible)} type={isLeftPanelVisible ? 'default' : 'text'} icon={<FontAwesomeIcon icon={faCog} />} /></Tooltip>
          <Tooltip title={t.showAnnotations}><Button onClick={() => setIsRightPanelVisible(!isRightPanelVisible)} type={isRightPanelVisible ? 'default' : 'text'} icon={<FontAwesomeIcon icon={faList} />} /></Tooltip>
        </div>
      </div>

      <aside className={`left-panel ${isLeftPanelVisible ? 'visible' : ''}`}>
        <Card title={t.settings}>
          <Form layout="vertical" className="settings-form">
            <Form.Item label={t.category}>
              <Select value={currentCategory} onChange={setCurrentCategory} style={{width: '100%'}} disabled={!hasImages}>
                {categories.map(cat => <Option key={cat} value={cat}>{cat}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item label={t.lineWidth}>
              <InputNumber min={1} value={lineWidth} onChange={(val) => setLineWidth(val || 1)} style={{width: '100%'}} disabled={!hasImages}/>
            </Form.Item>
          </Form>
        </Card>
      </aside>

      <aside className={`right-panel ${isRightPanelVisible ? 'visible' : ''}`}>
        <Card title={t.annotations} bodyStyle={{padding: '1px 0 0 0', height: 'calc(100% - 57px)'}}>
          <div className="info-panel-content">
            {hasImages && currentBoxes.length > 0 ? (
              <Collapse activeKey={expandedKeys} onChange={setExpandedKeys} accordion>
                {currentBoxes.map((item, index) => (
                  <Panel
                    className="annotation-item"
                    key={index}
                    header={
                      <Space align="center">
                        <div className="color-indicator" style={{backgroundColor: item.color}} />
                        <Text className="category-name">{item.category}</Text>
                      </Space>
                    }
                  >
                    <div className="annotation-details">
                      {'points' in item ? (
                        <p>{t.diagonalArea}: {item.points.map(p => `(${p.x}, ${p.y})`).join(', ')}</p>
                      ) : (
                        <p>{t.positionAndSize}: ({item.x}, {item.y}) - {item.width}×{item.height}</p>
                      )}
                    </div>
                  </Panel>
                ))}
              </Collapse>
            ) : (
              <Text type="secondary" style={{padding: '16px', display: 'block', textAlign: 'center'}}>{hasImages ? t.noAnnotations : t.noImages}</Text>
            )}
          </div>
        </Card>
      </aside>

      <div className="bottom-statusbar">
        <Text ellipsis style={{maxWidth: '50%'}}>{hasImages ? `${t.currentImage} ${currentImage.name}` : t.noImages}</Text>
        <Space>
          <Text>{t.imageSize}: {imageDimensions.width} x {imageDimensions.height}</Text>
          <Text>{t.mouseCoords}: ({mousePosition.x}, {mousePosition.y})</Text>
        </Space>
      </div>
    </div>
  );
};

export default MaskOperate;
