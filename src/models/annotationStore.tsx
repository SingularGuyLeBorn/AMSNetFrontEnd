// FILE: src/models/annotationStore.tsx
import type { ClassInfo, Operation } from '@/pages/FileOperate/constants';
import { initialIndexClassColorMap } from '@/pages/FileOperate/constants';
import type { ImageAnnotationData, UndoOperation as MaskUndoOperation } from '@/pages/MaskOperate/constants';
import { defaultCategoryColors } from '@/pages/MaskOperate/constants';
import { useState } from 'react';

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

const initialMaskCategoryHexColors = Object.entries(defaultCategoryColors).reduce(
  (acc, [key, value]) => {
    acc[key] = rgbaToHex(value);
    return acc;
  },
  {} as { [key: string]: string }
);

/**
 * @description
 * 全局数据仓库 (Global Data Store)
 *
 * 该 Store 负责管理整个应用中与标注相关的共享状态。
 * 设计原则 (重构后):
 * 1. 源数据分离: 所有源数据通过 `workspaceService` 访问，Store 不持有源数据。
 * 2. 脏数据缓存: Store 作为整个会话的 "脏数据缓存"。任何未保存的修改都存在这里。
 * 3. 索引独立：`file_currentIndex` 和 `mask_currentIndex` 是各自页面的独立指针。
 * 4. Bedrock Change: 增加全局锁 `isAppBusy`，用于防止异步操作的竞态条件。
 */
export default function useAnnotationStore() {
  // ===================================================================
  // Workspace & 共享状态
  // ===================================================================
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  /**
   * @description Bedrock Change: 全局应用繁忙状态锁。
   * 在任何关键的、耗时的异步操作（如加载、保存、AI处理）期间，此状态应为 true。
   * 它用于禁用全局范围内的冲突交互，防止竞态条件。
   */
  const [isAppBusy, setAppBusy] = useState<boolean>(false);

  // ===================================================================
  // FileOperate 页面状态
  // ===================================================================
  const [file_currentIndex, setFile_currentIndex] = useState<number>(0);
  const [file_classMap, setFile_classMap] = useState<{ [key: number]: ClassInfo }>(initialIndexClassColorMap);
  const [file_dirtyYolo, setFile_dirtyYolo] = useState<{ [imageKey: string]: string }>({});
  const [file_dirtyJson, setFile_dirtyJson] = useState<{ [imageKey: string]: string }>({});
  const [file_operationHistory, setFile_operationHistory] = useState<Record<number, Operation[]>>({});
  const [file_redoHistory, setFile_redoHistory] = useState<Record<number, Operation[]>>({});

  // ===================================================================
  // MaskOperate 页面状态
  // ===================================================================
  const [mask_currentIndex, setMask_currentIndex] = useState<number>(0);
  const [mask_allImageAnnotations, setMask_allImageAnnotations] = useState<{ [imageName: string]: ImageAnnotationData }>({});
  const [mask_categories, setMask_categories] = useState<string[]>(Object.keys(defaultCategoryColors));
  const [mask_categoryColors, setMask_categoryColors] = useState<{ [key: string]: string }>(initialMaskCategoryHexColors);
  const [mask_selectedAnnotationId, setMask_selectedAnnotationId] = useState<string | null>(null);
  const [mask_operationHistory, setMask_operationHistory] = useState<Record<number, MaskUndoOperation[]>>({});
  const [mask_redoHistory, setMask_redoHistory] = useState<Record<number, MaskUndoOperation[]>>({});

  const clearAllDirtyData = () => {
    setFile_dirtyYolo({});
    setFile_dirtyJson({});
    setMask_allImageAnnotations({});
    setFile_operationHistory({});
    setFile_redoHistory({});
    setMask_operationHistory({});
    setMask_redoHistory({});
  };


  return {
    // Workspace & Shared Exports
    imageKeys, setImageKeys,
    isAppBusy, setAppBusy,
    clearAllDirtyData,

    // FileOperate Exports
    file_currentIndex, setFile_currentIndex,
    file_classMap, setFile_classMap,
    file_dirtyYolo, setFile_dirtyYolo,
    file_dirtyJson, setFile_dirtyJson,
    file_operationHistory, setFile_operationHistory,
    file_redoHistory, setFile_redoHistory,

    // MaskOperate Exports
    mask_currentIndex, setMask_currentIndex,
    mask_allImageAnnotations, setMask_allImageAnnotations,
    mask_categories, setMask_categories,
    mask_categoryColors, setMask_categoryColors,
    mask_selectedAnnotationId, setMask_selectedAnnotationId,
    mask_operationHistory, setMask_operationHistory,
    mask_redoHistory, setMask_redoHistory,
  };
}
