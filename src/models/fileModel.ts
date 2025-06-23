// src/models/fileModel.ts
import { useState, useCallback } from 'react';

// --- 类型定义 ---
// FileOperate (Device Labeling) 页面状态接口
export interface DeviceLabelingState {
  pngList: File[];
  yoloList: File[];
  jsonList: File[];
  currentIndex: number;
}

// MaskOperate (Net Labeling) 页面相关类型
type Point = { x: number; y: number };

type ViewBoxAnnotation = {
  id: string;
  x: number; y: number; width: number; height: number;
  category: string; color: string;
  sourceLineWidth: number;
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

// MaskOperate (Net Labeling) 页面状态接口
export interface NetLabelingState {
  images: ImageFileInfo[];
  currentImageIndex: number;
  allImageAnnotations: { [imageName: string]: ImageAnnotationData };
  undoStack: UndoOperation[];
  redoStack: UndoOperation[];
}

// 全局共享的类别状态接口
export interface CategoryState {
  categories: string[];
  categoryColors: { [key: string]: string };
}

/**
 * 全局模型，用于在不同页面间共享文件、标注和类别状态。
 * 这解决了跨页面数据持久化的问题，优化了用户体验。
 */
export default function filePersistenceModel() {
  // DeviceLabeling 页面的状态
  const [deviceLabelingState, setDeviceLabelingState] = useState<DeviceLabelingState>({
    pngList: [],
    yoloList: [],
    jsonList: [],
    currentIndex: 0,
  });

  // NetLabeling 页面的状态
  const [netLabelingState, setNetLabelingState] = useState<NetLabelingState>({
    images: [],
    currentImageIndex: -1,
    allImageAnnotations: {},
    undoStack: [],
    redoStack: [],
  });

  // 动态标注类别状态 (全局共享)
  const [categoryState, setCategoryState] = useState<CategoryState>({
    categories: ['capacitor', 'pmos', 'nmos', 'vdd', 'gnd'], // 默认值
    categoryColors: {
      'capacitor': '#ff0000',
      'pmos': '#00ff00',
      'nmos': '#0000ff',
      'vdd': '#ffff00',
      'gnd': '#ff00ff'
    },
  });

  // 使用 useCallback 包装状态更新函数，以优化性能
  const updateDeviceLabelingState = useCallback((newState: Partial<DeviceLabelingState>) => {
    setDeviceLabelingState(prevState => ({ ...prevState, ...newState }));
  }, []);

  const updateNetLabelingState = useCallback((newState: Partial<NetLabelingState>) => {
    setNetLabelingState(prevState => ({ ...prevState, ...newState }));
  }, []);

  const updateCategoryState = useCallback((newState: Partial<CategoryState>) => {
    setCategoryState(prevState => ({...prevState, ...newState}));
  }, []);

  return {
    // Device Labeling
    deviceLabelingState,
    setDeviceLabelingState: updateDeviceLabelingState,

    // Net Labeling
    netLabelingState,
    setNetLabelingState: updateNetLabelingState,

    // Categories (Shared)
    categoryState,
    setCategoryState: updateCategoryState,
  };
}