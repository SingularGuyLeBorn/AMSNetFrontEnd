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
 * 全局数据仓库 (Global Data Store) V4.1 - 绝对隔离版
 *
 * 该 Store 负责管理整个应用中与标注相关的共享状态。
 * 设计原则：
 * 1. 页面上下文隔离: 每个标注页面 (`FileOperate`, `MaskOperate`) 拥有自己独立的当前文件指针和所有相关状态，包括修改记录，彻底解决了页面间任何状态的交叉污染问题。
 * 2. 路径驱动 (Path-Driven): 所有与文件相关的状态，其访问键都是文件的唯一路径 (filePath)。
 * 3. 统一数据源: `fileTree` 作为单一的、权威的文件结构源。
 * 4. 命名空间: 所有页面专属状态均以页面标识（如 `file_`, `mask_`）为前缀，确保了代码层面的隔离性和可读性。
 */
export default function useAnnotationStore() {
  // ===================================================================
  // 共享状态 (Shared State)
  // ===================================================================

  const [fileTree, setFileTree] = useState<DirectoryNode | null>(null);

  // ===================================================================
  // FileOperate 页面状态 (FileOperate Page State)
  // ===================================================================

  const [file_currentFilePath, setFile_currentFilePath] = useState<string | null>(null);
  const [file_modifiedFiles, setFile_modifiedFiles] = useState<Record<string, number>>({});
  const [file_yoloFileContents, setFile_yoloFileContents] = useState<Record<string, string>>({});
  const [file_jsonFileContents, setFile_jsonFileContents] = useState<Record<string, string>>({});
  const [file_classMap, setFile_classMap] = useState<{ [key: number]: ClassInfo }>(initialIndexClassColorMap);
  const [file_operationHistory, setFile_operationHistory] = useState<Record<string, Operation[]>>({});
  const [file_redoHistory, setFile_redoHistory] = useState<Record<string, Operation[]>>({});

  // ===================================================================
  // MaskOperate 页面状态 (MaskOperate Page State)
  // ===================================================================

  const [mask_currentFilePath, setMask_currentFilePath] = useState<string | null>(null);
  const [mask_modifiedFiles, setMask_modifiedFiles] = useState<Record<string, number>>({});
  const [mask_allImageAnnotations, setMask_allImageAnnotations] = useState<Record<string, ImageAnnotationData>>({});
  const [mask_categories, setMask_categories] = useState<string[]>(Object.keys(defaultCategoryColors));
  const [mask_categoryColors, setMask_categoryColors] = useState<{ [key: string]: string }>(initialMaskCategoryHexColors);
  const [mask_selectedAnnotationId, setMask_selectedAnnotationId] = useState<string | null>(null);
  const [mask_operationHistory, setMask_operationHistory] = useState<Record<string, MaskUndoOperation[]>>({});
  const [mask_redoHistory, setMask_redoHistory] = useState<Record<string, MaskUndoOperation[]>>({});


  return {
    // Shared State Exports
    fileTree, setFileTree,

    // FileOperate Exports
    file_currentFilePath, setFile_currentFilePath,
    file_modifiedFiles, setFile_modifiedFiles,
    file_yoloFileContents, setFile_yoloFileContents,
    file_jsonFileContents, setFile_jsonFileContents,
    file_classMap, setFile_classMap,
    file_operationHistory, setFile_operationHistory,
    file_redoHistory, setFile_redoHistory,

    // MaskOperate Exports
    mask_currentFilePath, setMask_currentFilePath,
    mask_modifiedFiles, setMask_modifiedFiles,
    mask_allImageAnnotations, setMask_allImageAnnotations,
    mask_categories, setMask_categories,
    mask_categoryColors, setMask_categoryColors,
    mask_selectedAnnotationId, setMask_selectedAnnotationId,
    mask_operationHistory, setMask_operationHistory,
    mask_redoHistory, setMask_redoHistory,
  };
}