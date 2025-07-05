// START OF FILE src/models/annotationStore.tsx
import type { DirectoryNode } from '@/models/fileTree.tsx';
import type { ClassInfo, Operation } from '@/pages/FileOperate/constants';
import { initialIndexClassColorMap } from '@/pages/FileOperate/constants';
import type { ImageAnnotationData, UndoOperation as MaskUndoOperation } from '@/pages/MaskOperate/constants';
import { defaultCategoryColors } from '@/pages/MaskOperate/constants';
import { useState } from 'react';

// Bedrock Change: Add a robust RGBA to HEX conversion helper function.
// This is critical for ensuring the color picker input works correctly, as it requires HEX values.
const rgbaToHex = (rgba: string): string => {
  // Return early if the value is already a valid HEX color or is invalid.
  if (!rgba || typeof rgba !== 'string') return '#000000';
  if (rgba.startsWith('#')) return rgba;

  // Use a regular expression to extract the R, G, B values.
  const parts = rgba.match(/(\d+(\.\d+)?)/g);
  if (!parts || parts.length < 3) return '#000000'; // Return black for invalid formats.

  // Parse integer values from the extracted parts.
  const r = parseInt(parts[0], 10);
  const g = parseInt(parts[1], 10);
  const b = parseInt(parts[2], 10);

  // Convert to HEX and ensure it has 6 digits, padding with leading zeros if necessary.
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
};

// Bedrock Change: Pre-process the default RGBA colors into HEX format upon initialization.
// This ensures that the state starts with the correct data type, preventing downstream bugs.
const initialMaskCategoryHexColors = Object.entries(defaultCategoryColors).reduce(
  (acc, [key, value]) => {
    acc[key] = rgbaToHex(value);
    return acc;
  },
  {} as { [key: string]: string }
);


/**
 * @description
 * 全局数据仓库 (Global Data Store) V2 - Path-Driven
 *
 * 该 Store 负责管理整个应用中与标注相关的共享状态。
 * 设计原则：
 * 1. 路径驱动 (Path-Driven): 所有与文件相关的状态，其访问键都是文件的唯一路径 (filePath)，彻底取代了旧的数组索引 (index) 模式。
 * 2. 状态隔离：通过明确的前缀（`file_` 和 `mask_`）区分不同页面的专属状态，避免交叉污染。
 * 3. 统一数据源：`fileTree` 作为单一的、权威的文件结构源，由全局上传组件填充，供两个标注页面消费。
 * 4. 统一导航：`currentFilePath` 作为全局唯一的导航指针，所有页面的数据加载都响应此状态的变化。
 */
export default function useAnnotationStore() {
  // ===================================================================
  // 共享状态
  // ===================================================================

  // 共享的文件树结构，是所有操作的基础
  const [fileTree, setFileTree] = useState<DirectoryNode | null>(null);

  // 【核心导航】全局当前激活的文件路径
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  // Bedrock Change V4: Track file modification status and timestamp.
  // The key is the file path, and the value is the timestamp of the last modification.
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, number>>({});

  // ===================================================================
  // FileOperate 页面状态
  // ===================================================================

  // FileOperate 页面的 YOLO 标注文件列表 (以路径为键)
  const [file_yoloFileContents, setFile_yoloFileContents] = useState<Record<string, string>>({});
  // FileOperate 页面的 JSON 染色文件列表 (以路径为键)
  const [file_jsonFileContents, setFile_jsonFileContents] = useState<Record<string, string>>({});

  // FileOperate 页面的类别定义
  const [file_classMap, setFile_classMap] = useState<{ [key: number]: ClassInfo }>(initialIndexClassColorMap);

  // FileOperate 页面的操作历史，用于撤销 (以路径为键)
  const [file_operationHistory, setFile_operationHistory] = useState<Record<string, Operation[]>>({});
  // FileOperate 页面的重做历史，用于恢复 (以路径为键)
  const [file_redoHistory, setFile_redoHistory] = useState<Record<string, Operation[]>>({});

  // ===================================================================
  // MaskOperate 页面状态
  // ===================================================================

  // MaskOperate 页面的所有图片标注数据集合，以图片路径为 key
  const [mask_allImageAnnotations, setMask_allImageAnnotations] = useState<Record<string, ImageAnnotationData>>({});

  // MaskOperate 页面的类别列表 (保持不变)
  const [mask_categories, setMask_categories] = useState<string[]>(Object.keys(defaultCategoryColors));

  const [mask_categoryColors, setMask_categoryColors] = useState<{ [key: string]: string }>(initialMaskCategoryHexColors);

  // MaskOperate 页面当前选中的标注ID
  const [mask_selectedAnnotationId, setMask_selectedAnnotationId] = useState<string | null>(null);

  // MaskOperate 页面的操作历史，用于撤销 (以路径为键)
  const [mask_operationHistory, setMask_operationHistory] = useState<Record<string, MaskUndoOperation[]>>({});
  // MaskOperate 页面的重做历史，用于恢复 (以路径为键)
  const [mask_redoHistory, setMask_redoHistory] = useState<Record<string, MaskUndoOperation[]>>({});

  // Bedrock Change V4: Centralized function to mark a file as modified.
  // This ensures consistent timestamping across the application.
  const markFileAsModified = (filePath: string | null) => {
    if (filePath) {
      setModifiedFiles(prev => ({ ...prev, [filePath]: Date.now() }));
    }
  };

  return {
    // Shared State Exports
    fileTree, setFileTree,
    currentFilePath, setCurrentFilePath,
    modifiedFiles, setModifiedFiles, // Export new state
    markFileAsModified, // Export new function

    // FileOperate Exports
    file_yoloFileContents, setFile_yoloFileContents,
    file_jsonFileContents, setFile_jsonFileContents,
    file_classMap, setFile_classMap,
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
// END OF FILE src/models/annotationStore.tsx