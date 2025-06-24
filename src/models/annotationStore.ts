// src/models/annotationStore.ts
import { useState } from 'react';
import { initialIndexClassColorMap } from '@/pages/FileOperate/constants';
import { defaultCategoryColors } from '@/pages/MaskOperate/constants';
import type { ClassInfo, Operation } from '@/pages/FileOperate/constants';
// 从 MaskOperate 的常量文件中导入类型定义
import type { ImageAnnotationData, UndoOperation as MaskUndoOperation } from '@/pages/MaskOperate/constants';

/**
 * @description
 * 全局数据仓库 (Global Data Store)
 */
export default function useAnnotationStore() {
  // ===================================================================
  // FileOperate & 共享状态
  // ===================================================================
  const [file_classMap, setFile_classMap] = useState<{ [key: number]: ClassInfo }>(initialIndexClassColorMap);
  const [file_pngList, setFile_pngList] = useState<File[]>([]);
  const [file_yoloList, setFile_yoloList] = useState<File[]>([]);
  const [file_jsonList, setFile_jsonList] = useState<File[]>([]);
  const [file_currentIndex, setFile_currentIndex] = useState<number>(0);
  const [file_currentYoloContent, setFile_currentYoloContent] = useState<string | null>(null);
  const [file_currentJsonContent, setFile_currentJsonContent] = useState<string | null>(null);
  const [file_operationHistory, setFile_operationHistory] = useState<Record<number, Operation[]>>({});
  const [file_redoHistory, setFile_redoHistory] = useState<Record<number, Operation[]>>({});

  // ===================================================================
  // MaskOperate 页面状态
  // ===================================================================
  const [mask_allImageAnnotations, setMask_allImageAnnotations] = useState<{ [imageName: string]: ImageAnnotationData }>({});
  const [mask_categories, setMask_categories] = useState<string[]>(Object.keys(defaultCategoryColors));
  const [mask_categoryColors, setMask_categoryColors] = useState<{ [key: string]: string }>({ ...defaultCategoryColors });
  const [mask_selectedAnnotationId, setMask_selectedAnnotationId] = useState<string | null>(null);
  
  // 【核心修正】将 undo/redo 栈的结构从全局数组改为按图片索引分区的对象
  const [mask_operationHistory, setMask_operationHistory] = useState<Record<number, MaskUndoOperation[]>>({});
  const [mask_redoHistory, setMask_redoHistory] = useState<Record<number, MaskUndoOperation[]>>({});

  return {
    // FileOperate Exports (及共享状态)
    file_classMap, setFile_classMap,
    file_pngList, setFile_pngList,
    file_yoloList, setFile_yoloList,
    file_jsonList, setFile_jsonList,
    file_currentIndex, setFile_currentIndex,
    file_currentYoloContent, setFile_currentYoloContent,
    file_currentJsonContent, setFile_currentJsonContent,
    file_operationHistory, setFile_operationHistory,
    file_redoHistory, setFile_redoHistory,

    // MaskOperate Exports
    mask_allImageAnnotations, setMask_allImageAnnotations,
    mask_categories, setMask_categories,
    mask_categoryColors, setMask_categoryColors,
    mask_selectedAnnotationId, setMask_selectedAnnotationId,
    mask_operationHistory, setMask_operationHistory,
    mask_redoHistory, setMask_redoHistory,
  };
}