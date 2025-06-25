// src/models/annotationStore.ts
import { useState } from 'react';
import { initialIndexClassColorMap } from '@/pages/FileOperate/constants';
import { defaultCategoryColors } from '@/pages/MaskOperate/constants';
import type { ClassInfo, Operation } from '@/pages/FileOperate/constants';
import type { ImageAnnotationData, UndoOperation as MaskUndoOperation } from '@/pages/MaskOperate/constants';

/**
 * @description
 * 全局数据仓库 (Global Data Store)
 *
 * 该 Store 负责管理整个应用中与标注相关的共享状态。
 * 设计原则：
 * 1. 状态隔离：通过明确的前缀（`file_` 和 `mask_`）区分不同页面的专属状态，避免交叉污染。
 * 2. 数据共享：`file_pngList` 作为共享的图片源，由全局上传组件填充，供两个标注页面消费。
 * 3. 索引独立：`file_currentIndex` 和 `mask_currentIndex` 是各自页面的独立指针，实现操作解耦。
 */
export default function useAnnotationStore() {
  // ===================================================================
  // FileOperate & 共享状态
  // ===================================================================

  // 共享的图片文件列表，是所有标注操作的数据基础
  const [file_pngList, setFile_pngList] = useState<File[]>([]);
  // FileOperate 页面的 YOLO 标注文件列表
  const [file_yoloList, setFile_yoloList] = useState<File[]>([]);
  // FileOperate 页面的 JSON 染色文件列表
  const [file_jsonList, setFile_jsonList] = useState<File[]>([]);

  // 【核心解耦】FileOperate 页面的当前图片索引
  const [file_currentIndex, setFile_currentIndex] = useState<number>(0);

  // FileOperate 页面的类别定义
  const [file_classMap, setFile_classMap] = useState<{ [key: number]: ClassInfo }>(initialIndexClassColorMap);
  // FileOperate 页面当前正在编辑的 YOLO 内容
  const [file_currentYoloContent, setFile_currentYoloContent] = useState<string | null>(null);
  // FileOperate 页面当前正在编辑的 JSON 内容
  const [file_currentJsonContent, setFile_currentJsonContent] = useState<string | null>(null);
  // FileOperate 页面的操作历史，用于撤销
  const [file_operationHistory, setFile_operationHistory] = useState<Record<number, Operation[]>>({});
  // FileOperate 页面的重做历史，用于恢复
  const [file_redoHistory, setFile_redoHistory] = useState<Record<number, Operation[]>>({});

  // ===================================================================
  // MaskOperate 页面状态
  // ===================================================================

  // 【核心解耦】MaskOperate 页面的当前图片索引
  const [mask_currentIndex, setMask_currentIndex] = useState<number>(0);

  // MaskOperate 页面的所有图片标注数据集合，以图片名为 key
  const [mask_allImageAnnotations, setMask_allImageAnnotations] = useState<{ [imageName: string]: ImageAnnotationData }>({});
  // MaskOperate 页面的类别列表
  const [mask_categories, setMask_categories] = useState<string[]>(Object.keys(defaultCategoryColors));
  // MaskOperate 页面的类别颜色映射
  const [mask_categoryColors, setMask_categoryColors] = useState<{ [key: string]: string }>({ ...defaultCategoryColors });
  // MaskOperate 页面当前选中的标注ID
  const [mask_selectedAnnotationId, setMask_selectedAnnotationId] = useState<string | null>(null);
  // MaskOperate 页面的操作历史，用于撤销
  const [mask_operationHistory, setMask_operationHistory] = useState<Record<number, MaskUndoOperation[]>>({});
  // MaskOperate 页面的重做历史，用于恢复
  const [mask_redoHistory, setMask_redoHistory] = useState<Record<number, MaskUndoOperation[]>>({});

  return {
    // FileOperate Exports (及共享状态)
    file_pngList, setFile_pngList,
    file_yoloList, setFile_yoloList,
    file_jsonList, setFile_jsonList,
    file_currentIndex, setFile_currentIndex,
    file_classMap, setFile_classMap,
    file_currentYoloContent, setFile_currentYoloContent,
    file_currentJsonContent, setFile_currentJsonContent,
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