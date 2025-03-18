import React, { useState, useRef, useEffect } from "react";
import "./Styles/MaskOperate.css"; // 引入样式文件
import { categoryColors } from "./Styles/constants.js"; // 引入类别颜色映射
import { useModel } from 'umi';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";

// Add translations object for language support
const translations = {
  zh: {
    // Left panel
    uploadFolder: "上传文件夹",
    folderName: "文件夹名：",
    selectCategory: "选择类别",
    setRectWidth: "设置矩形宽度",
    undo: "撤回",
    exportJSON: "导出JSON",
    diagonalAnnotation: "斜线标注",
    deleteMode: "删除模式",
    noImagesUploaded: "请先上传文件夹",

    // Center panel
    previousImage: "上一张",
    nextImage: "下一张",
    currentImageName: "当前图片名：",

    // Right panel
    drawnBoxInfo: "已绘制框信息",
    diagonalArea: "斜线区域"
  },
  en: {
    // Left panel
    uploadFolder: "Upload Folder",
    folderName: "Folder Name:",
    selectCategory: "Select Category",
    setRectWidth: "Set Rectangle Width",
    undo: "Undo",
    exportJSON: "Export JSON",
    diagonalAnnotation: "Diagonal Annotation",
    deleteMode: "Delete Mode",
    noImagesUploaded: "Please upload a folder first",

    // Center panel
    previousImage: "Previous",
    nextImage: "Next",
    currentImageName: "Current Image:",

    // Right panel
    drawnBoxInfo: "Drawn Box Information",
    diagonalArea: "Diagonal Area"
  }
};

const MaskOperate = () => {
  // Add language support
  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang];

  // Update language when global language changes
  useEffect(() => {
    const handleLanguageChange = (event) => {
      const customEvent = event;
      setCurrentLang(customEvent.detail.language);
    };

    window.addEventListener('languageChange', handleLanguageChange);
    setCurrentLang(initialState?.language || 'zh');

    // message.info(currentLang === 'zh' ? '已切换为中文' : 'Language changed to English');

    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, [initialState?.language]);

  // 状态管理
  const [folderName, setFolderName] = useState(""); // 当前文件夹名称
  const [images, setImages] = useState([]); // 图片列表
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // 当前图片索引
  const [currentCategory, setCurrentCategory] = useState("Net 1"); // 当前选择的类别
  const [lineWidth, setLineWidth] = useState(12); // 矩形宽度
  const [isDrawing, setIsDrawing] = useState(false); // 是否在绘制矩形
  const [startPosition, setStartPosition] = useState(null); // 绘制起始位置
  const [isDrawingDiagonal, setIsDrawingDiagonal] = useState(false); // 是否在绘制斜线区域
  const [diagonalPoints, setDiagonalPoints] = useState([]); // 斜线区域的两个点
  const [imageBoxes, setImageBoxes] = useState({}); // 图片对应的标注框数据
  const canvasRef = useRef(null); // Canvas引用
  const [isDeleting, setIsDeleting] = useState(false); // 是否处于删除模式

  // 判断是否有图片被上传
  const hasImages = images.length > 0;

  const categories = Object.keys(categoryColors);

  useEffect(() => {
    const handleKeyDown = (event) => {
      // 如果没有图片，不处理键盘事件
      if (!hasImages) return;

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'w' || event.key === 's') {
        const currentIndex = categories.indexOf(currentCategory);
        if (currentIndex === -1) return; // 当前类别不在列表中，不处理

        let newIndex;
        if (event.key === 'ArrowUp' || event.key === 'w') {
          newIndex = (currentIndex - 1 + categories.length) % categories.length;
        } else if (event.key === 'ArrowDown' || event.key === 's') {
          newIndex = (currentIndex + 1) % categories.length;
        }
        setCurrentCategory(categories[newIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [categories, currentCategory, hasImages]);

  // 当前图片和标注框数据
  const currentImage = images[currentImageIndex];
  const currentBoxes = currentImage ? (imageBoxes[currentImage.name] || []) : [];

  /**
   * 处理文件夹上传
   * @param {Event} e 上传事件
   */
  const handleFolderUpload = (e) => {
    const files = Array.from(e.target.files);
    // 检查是否有文件上传
    if (files.length === 0) return;

    const folder = extractFolderName(files[0]?.webkitRelativePath || "");
    setFolderName(folder);

    const imageFiles = filterImageFiles(files);
    const jsonFiles = filterJsonFiles(files);

    const sortedImageUrls = sortImageFiles(imageFiles);
    setImages(sortedImageUrls);

    initializeImageBoxes(sortedImageUrls);

    parseJsonFiles(jsonFiles);
  };

  /**
   * 提取文件夹名称
   * @param {string} path 文件路径
   * @returns {string} 文件夹名称
   */
  const extractFolderName = (path) => {
    return path.split("/")[0];
  };

  /**
   * 筛选图片文件
   * @param {File[]} files 文件列表
   * @returns {File[]} 图片文件列表
   */
  const filterImageFiles = (files) => {
    return files.filter(file => file.type.match(/image\/(jpeg|png)/));
  };

  /**
   * 筛选JSON文件
   * @param {File[]} files 文件列表
   * @returns {File[]} JSON文件列表
   */
  const filterJsonFiles = (files) => {
    return files.filter(file => file.name.endsWith(".json"));
  };

  /**
   * 对图片文件进行排序
   * @param {File[]} imageFiles 图片文件列表
   * @returns {Object[]} 排序后的图片URL列表
   */
  const sortImageFiles = (imageFiles) => {
    return imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
        .map(file => ({ name: file.name, url: URL.createObjectURL(file) }));
  };

  /**
   * 初始化图片对应的标注框数据
   * @param {Object[]} imageUrls 图片URL列表
   */
  const initializeImageBoxes = (imageUrls) => {
    setImageBoxes(prevBoxes => {
      imageUrls.forEach(img => prevBoxes[img.name] = prevBoxes[img.name] || []);
      return { ...prevBoxes };
    });
  };

  /**
   * 解析JSON文件并更新标注框数据
   * @param {File[]} jsonFiles JSON文件列表
   */
  const parseJsonFiles = (jsonFiles) => {
    jsonFiles.forEach(jsonFile => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const jsonData = JSON.parse(event.target.result);
        const fileName = jsonFile.name.replace(".json", ".jpg");
        if (images.some(img => img.name === fileName)) {
          setImageBoxes(prevBoxes => ({
            ...prevBoxes,
            [fileName]: jsonData.map(box => ({
              ...box,
              color: categoryColors[box.category] || "rgba(128, 128, 128, 0.3)",
            })),
          }));
        }
      };
      reader.readAsText(jsonFile);
    });
  };

  /**
   * 处理Canvas点击事件
   * @param {Event} e 点击事件
   */
  const handleCanvasClick = (e) => {
    // 如果没有图片，不处理点击事件
    if (!hasImages) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (isDeleting) {
      deleteBoxByPoint(x, y);
    } else if (isDrawingDiagonal) {
      handleDiagonalDrawing(x, y);
    } else if (isDrawing) {
      handleRectangleDrawing(x, y);
    } else {
      setStartPosition({ x, y });
      setIsDrawing(true);
    }
  };

  /**
   * 删除点击点所在的标注框
   * @param {number} x 点击点X坐标
   * @param {number} y 点击点Y坐标
   */
  const deleteBoxByPoint = (x, y) => {
    const boxToRemove = findBoxByPoint(x, y);
    if (boxToRemove) {
      setImageBoxes(prevBoxes => {
        const newBoxes = { ...prevBoxes };
        newBoxes[currentImage.name] = prevBoxes[currentImage.name].filter(box => box !== boxToRemove);
        return newBoxes;
      });
      drawCanvas();
    }
  };

  /**
   * 处理斜线区域绘制
   * @param {number} x 点击点X坐标
   * @param {number} y 点击点Y坐标
   */
  const handleDiagonalDrawing = (x, y) => {
    setDiagonalPoints(prevPoints => {
      const newPoints = [...prevPoints, { x, y }];
      if (newPoints.length === 2) {
        drawDiagonalRegion(newPoints);
        saveDiagonalRegion(newPoints);
        setDiagonalPoints([]);
        setIsDrawingDiagonal(false);
      }
      return newPoints;
    });
  };

  /**
   * 处理矩形绘制
   * @param {number} x 点击点X坐标
   * @param {number} y 点击点Y坐标
   */
  const handleRectangleDrawing = (x, y) => {
    const endPosition = { x, y };
    const { boxX, boxY, boxWidth, boxHeight } = calculateBoxDimensions(startPosition, endPosition);

    const newBox = createBox(boxX, boxY, boxWidth, boxHeight);
    setImageBoxes(prevBoxes => ({
      ...prevBoxes,
      [currentImage.name]: [...prevBoxes[currentImage.name], newBox],
    }));
    drawCanvas();
    setIsDrawing(false);
    setStartPosition(null);
  };

  /**
   * 计算矩形的尺寸
   * @param {Object} startPosition 起始点
   * @param {Object} endPosition 结束点
   * @returns {Object} 矩形的X、Y、宽度和高度
   */
  const calculateBoxDimensions = (startPosition, endPosition) => {
    const dx = Math.abs(endPosition.x - startPosition.x);
    const dy = Math.abs(endPosition.y - startPosition.y);

    let boxX, boxY, boxWidth, boxHeight;

    if (dy < 5) {
      boxX = Math.min(startPosition.x, endPosition.x);
      boxY = (startPosition.y + endPosition.y) / 2 - lineWidth / 2;
      boxWidth = dx;
      boxHeight = lineWidth;
    } else if (dx < 5) {
      boxX = (startPosition.x + endPosition.x) / 2 - lineWidth / 2;
      boxY = Math.min(startPosition.y, endPosition.y);
      boxWidth = lineWidth;
      boxHeight = dy;
    } else {
      boxX = Math.min(startPosition.x, endPosition.x);
      boxY = Math.min(startPosition.y, endPosition.y);
      boxWidth = dx;
      boxHeight = dy;
    }

    return { boxX, boxY, boxWidth, boxHeight };
  };

  /**
   * 创建新的标注框对象
   * @param {number} x X坐标
   * @param {number} y Y坐标
   * @param {number} width 宽度
   * @param {number} height 高度
   * @returns {Object} 标注框对象
   */
  const createBox = (x, y, width, height) => {
    return {
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
      width: parseFloat(width.toFixed(2)),
      height: parseFloat(height.toFixed(2)),
      category: currentCategory,
      color: categoryColors[currentCategory],
      lineWidth: 0.3,
    };
  };

  /**
   * 查找点击点所在的标注框
   * @param {number} x 点击点X坐标
   * @param {number} y 点击点Y坐标
   * @returns {Object|null} 找到的标注框或null
   */
  const findBoxByPoint = (x, y) => {
    for (let i = currentBoxes.length - 1; i >= 0; i--) {
      const box = currentBoxes[i];
      if (box.points && box.points.length === 2) {
        if (isPointInRotatedRect(x, y, box.points[0], box.points[1], lineWidth)) {
          return box;
        }
      } else {
        if (isPointInBox(x, y, box)) {
          return box;
        }
      }
    }
    return null;
  };

  /**
   * 检查点是否在旋转的矩形内
   * @param {number} x 点X坐标
   * @param {number} y 点Y坐标
   * @param {Object} p1 点1
   * @param {Object} p2 点2
   * @param {number} height 矩形高度
   * @returns {boolean} 是否在旋转矩形内
   */
  const isPointInRotatedRect = (x, y, p1, p2, height) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const rot = Math.atan2(dy, dx);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    const px = x - (p1.x + p2.x) / 2;
    const py = y - (p1.y + p2.y) / 2;
    const xr = px * cos + py * sin;
    const yr = -px * sin + py * cos;

    if (Math.abs(xr) <= len / 2 + 1 && Math.abs(yr) <= height / 2 + 1) {
      return true;
    }
    return false;
  };

  /**
   * 检查点是否在矩形框内
   * @param {number} x 点X坐标
   * @param {number} y 点Y坐标
   * @param {Object} box 标注框对象
   * @returns {boolean} 是否在矩形框内
   */
  const isPointInBox = (x, y, box) => {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  };

  /**
   * 绘制斜线区域
   * @param {Object[]} points 斜线区域的两个点
   */
  const drawDiagonalRegion = (points) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { angle, width, height, centerX, centerY } = calculateRotationParams(points);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-width / 2, -height / 2, width, height);
    ctx.fillStyle = categoryColors[currentCategory] || "rgba(128, 128, 128, 0.3)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  /**
   * 计算旋转参数
   * @param {Object[]} points 斜线区域的两个点
   * @returns {Object} 旋转角度、宽度、高度、中心X、中心Y
   */
  const calculateRotationParams = (points) => {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const angle = Math.atan2(dy, dx);
    const width = Math.sqrt(dx * dx + dy * dy);
    const height = lineWidth;
    const centerX = (points[0].x + points[1].x) / 2;
    const centerY = (points[0].y + points[1].y) / 2;
    return { angle, width, height, centerX, centerY };
  };

  /**
   * 保存斜线区域到标注框数据
   * @param {Object[]} points 斜线区域的两个点
   */
  const saveDiagonalRegion = (points) => {
    const newRegion = {
      points: points.map(point => ({ x: point.x, y: point.y })),
      category: currentCategory,
      color: categoryColors[currentCategory],
    };
    setImageBoxes(prevBoxes => ({
      ...prevBoxes,
      [currentImage.name]: [...prevBoxes[currentImage.name], newRegion],
    }));
    drawCanvas();
  };

  /**
   * 绘制Canvas内容
   */
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentImage) {
      const img = new Image();
      img.src = currentImage.url;
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        currentBoxes.forEach(box => {
          if (box.points && box.points.length === 2) {
            drawDiagonalRegionWithColor(box);
          } else {
            drawRectangleBox(box);
          }
        });
      };
    } else {
      // 没有图片时，绘制提示文本
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "20px Arial";
      ctx.fillStyle = "#666";
      ctx.textAlign = "center";
      ctx.fillText(t.noImagesUploaded, canvas.width / 2, canvas.height / 2);
    }
  };

  /**
   * 绘制斜线区域，并使用对应的颜色
   * @param {Object} box 标注框对象
   */
  const drawDiagonalRegionWithColor = (box) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { angle, width, height, centerX, centerY } = calculateRotationParams(box.points);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-width / 2, -height / 2, width, height);
    ctx.fillStyle = box.color || "rgba(128, 128, 128, 0.3)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  /**
   * 绘制矩形框
   * @param {Object} box 标注框对象
   */
  const drawRectangleBox = (box) => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = box.color;
    ctx.strokeStyle = "black";
    ctx.lineWidth = box.lineWidth || 1;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  };

  // 更新Canvas内容
  useEffect(() => {
    drawCanvas();
  }, [currentImage, currentBoxes, lineWidth, diagonalPoints]);

  /**
   * 切换到上一张图片
   */
  const handlePreviousImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(prevIndex => prevIndex - 1);
    }
  };

  /**
   * 切换到下一张图片
   */
  const handleNextImage = () => {
    if (currentImageIndex < images.length - 1) {
      setCurrentImageIndex(prevIndex => prevIndex + 1);
    }
  };

  /**
   * 撤回最后一个标注框
   */
  const handleUndo = () => {
    if (!hasImages) return;

    setImageBoxes(prevBoxes => ({
      ...prevBoxes,
      [currentImage.name]: currentBoxes.slice(0, -1),
    }));
    drawCanvas();
  };

  /**
   * 导出标注框数据为JSON文件
   */
  const handleExport = () => {
    if (!hasImages || !currentImage) return;

    const groupedBoxes = currentBoxes.reduce((acc, box) => {
      if (!acc[box.category]) acc[box.category] = [];
      if (box.points) {
        acc[box.category].push({ points: box.points.map(point => ({ x: point.x, y: point.y })) });
      } else {
        acc[box.category].push({ x: box.x, y: box.y, width: box.width, height: box.height });
      }
      return acc;
    }, {});

    const jsonContent = JSON.stringify(groupedBoxes, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${currentImage.name.split(".")[0]}.json`;
    link.click();
  };

  /**
   * 切换删除模式
   */
  const handleDeleteMode = () => {
    if (!hasImages) return;

    setIsDeleting(prev => !prev);
    if (isDrawing) {
      setIsDrawing(false);
      setIsDrawingDiagonal(false);
      setDiagonalPoints([]);
    }
  };

  return (
      <div className="container">
        {/* 左侧控制区域 */}
        <div className="left-panel">
          <section className="upload-section">
            <h3>{t.uploadFolder}</h3>
            <div className="upload-button-container">
              <button
                  className="icon-button"
                  onClick={() => document.querySelector('.file-input').click()}
              >
                <FontAwesomeIcon icon={faUpload} />
              </button>
              <input
                  type="file"
                  webkitdirectory="true"
                  multiple
                  onChange={handleFolderUpload}
                  className="file-input"
                  style={{ display: 'none' }}
              />
            </div>
            {folderName && <p className="folder-name">{t.folderName} {folderName}</p>}
          </section>

          <section className="category-section">
            <h3>{t.selectCategory}</h3>
            <select
                value={currentCategory}
                onChange={e => setCurrentCategory(e.target.value)}
                className="category-select-with-color"
                disabled={!hasImages}
            >
              {Object.keys(categoryColors).map(category => (
                  <option
                      key={category}
                      value={category}
                      style={{
                        background: categoryColors[category],
                        color: "white",
                        paddingLeft: "1.5em",
                      }}
                  >
                    {category}
                  </option>
              ))}
            </select>
          </section>

          <section className="control-section">
            <h3>{t.setRectWidth}</h3>
            <input
                type="number"
                value={lineWidth}
                onChange={e => setLineWidth(parseFloat(e.target.value))}
                min={0.1}
                step={0.1}
                className="line-width-input"
                disabled={!hasImages}
            />
          </section>

          <section className="action-section">
            <button
                onClick={handleUndo}
                className="action-button"
                disabled={!hasImages || currentBoxes.length === 0}
            >
              {t.undo}
            </button>
            <button
                onClick={handleExport}
                className="action-button"
                disabled={!hasImages || currentBoxes.length === 0}
            >
              {t.exportJSON}
            </button>
            <button
                onClick={() => hasImages && setIsDrawingDiagonal(prev => !prev)}
                className={`action-button ${isDrawingDiagonal ? 'active' : ''}`}
                disabled={!hasImages}
            >
              {t.diagonalAnnotation}
            </button>
            <button
                onClick={handleDeleteMode}
                className={`action-button ${isDeleting ? 'active' : ''}`}
                disabled={!hasImages}
            >
              {t.deleteMode}
            </button>
          </section>
        </div>

        {/* 中间Canvas绘图区 */}
        <div className="center-panel">
          <div className="navigation-controls">
            <button
                onClick={handlePreviousImage}
                disabled={!hasImages || currentImageIndex === 0}
                className="nav-button"
            >
              {t.previousImage}
            </button>
            {currentImage && <span className="current-image">{t.currentImageName} {currentImage.name}</span>}
            <button
                onClick={handleNextImage}
                disabled={!hasImages || currentImageIndex === images.length - 1}
                className="nav-button"
            >
              {t.nextImage}
            </button>
          </div>

          <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className={`drawing-canvas ${!hasImages ? 'no-images' : ''}`}
              onClick={handleCanvasClick}
          ></canvas>
        </div>

        {/* 右侧显示区域 */}
        <div className="right-panel">
          <h3>{t.drawnBoxInfo}</h3>
          {hasImages && currentBoxes.length > 0 ? (
              <ul className="box-list">
                {currentBoxes.map((box, index) => (
                    <li key={index} className="box-item">
                      <div
                          className="color-block"
                          style={{ backgroundColor: box.color }}
                      ></div>
                      <span className="box-details">
                {box.category}: {
                        box.points
                            ? `${t.diagonalArea} (${box.points.map(point =>
                                `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`).join(', ')})`
                            : `(${box.x.toFixed(2)}, ${box.y.toFixed(2)}) - ${box.width.toFixed(2)}x${box.height.toFixed(2)}`
                      }
              </span>
                    </li>
                ))}
              </ul>
          ) : (
              <p className="no-data">{t.noImagesUploaded}</p>
          )}
        </div>
      </div>
  );
};

export default MaskOperate;
