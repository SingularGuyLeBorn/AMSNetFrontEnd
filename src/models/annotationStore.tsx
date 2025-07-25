// START OF FILE src/models/annotationStore.tsx
import type { VersionHistory } from '@/hooks/useVersionControl';
import type { DirectoryNode } from '@/models/fileTree.tsx';
import type { ClassInfo } from '@/pages/FileOperate/constants';
import { initialIndexClassColorMap } from '@/pages/FileOperate/constants';
import type { ImageAnnotationData } from '@/pages/MaskOperate/constants';
import { defaultCategoryColors } from '@/pages/MaskOperate/constants';
import { useState } from 'react';

/**
 * @description A robust utility to convert an RGBA color string to a 6-digit HEX string.
 *              This is critical for UI components like `<input type="color">` which only accept HEX format.
 * @param rgba - The input color string, e.g., 'rgba(255, 159, 64, 0.4)'.
 * @returns The HEX color string, e.g., '#ff9f40'. Returns black for invalid input.
 */
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

// Bedrock V4.3 Change: Unified the initial class map structure for both pages.
const initialMaskIndexClassColorMap: { [key: number]: ClassInfo } = Object.entries(defaultCategoryColors)
  .reduce((acc, [label, rgbaColor], index) => {
    acc[index] = {
      label,
      color: rgbaToHex(rgbaColor),
    };
    return acc;
  }, {} as { [key: number]: ClassInfo });

type FileOperateState = { yoloContent: string | null; jsonContent: string | null; };

/**
 * @description
 * 全局数据仓库 (Global Data Store) V4.2 - 版本树模型
 *
 * 该 Store 负责管理整个应用中与标注相关的共享状态。
 * 设计原则：
 * 1. 统一版本模型: `FileOperate` 和 `MaskOperate` 现已共享完全一致的、基于图（树）的版本控制数据模型。
 * 2. 状态原子化: 所有与标注内容相关的状态都以完整的快照形式存储在版本节点中。
 * 3. 路径驱动 (Path-Driven): 所有与文件相关的状态，其访问键都是文件的唯一路径 (filePath)。
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
  const [file_versionHistory, setFile_versionHistory] = useState<Record<string, VersionHistory<FileOperateState>>>({});


  // ===================================================================
  // MaskOperate 页面状态 (MaskOperate Page State)
  // ===================================================================

  const [mask_currentFilePath, setMask_currentFilePath] = useState<string | null>(null);
  const [mask_modifiedFiles, setMask_modifiedFiles] = useState<Record<string, number>>({});
  const [mask_allImageAnnotations, setMask_allImageAnnotations] = useState<Record<string, ImageAnnotationData>>({});
  const [mask_classMap, setMask_classMap] = useState<{ [key: number]: ClassInfo }>(initialMaskIndexClassColorMap);
  const [mask_selectedAnnotationId, setMask_selectedAnnotationId] = useState<string | null>(null);
  const [mask_versionHistory, setMask_versionHistory] = useState<Record<string, VersionHistory<ImageAnnotationData>>>({});


  return {
    // Shared State Exports
    fileTree, setFileTree,

    // FileOperate Exports
    file_currentFilePath, setFile_currentFilePath,
    file_modifiedFiles, setFile_modifiedFiles,
    file_yoloFileContents, setFile_yoloFileContents,
    file_jsonFileContents, setFile_jsonFileContents,
    file_classMap, setFile_classMap,
    file_versionHistory, setFile_versionHistory,


    // MaskOperate Exports
    mask_currentFilePath, setMask_currentFilePath,
    mask_modifiedFiles, setMask_modifiedFiles,
    mask_allImageAnnotations, setMask_allImageAnnotations,
    mask_classMap, setMask_classMap,
    mask_selectedAnnotationId, setMask_selectedAnnotationId,
    mask_versionHistory, setMask_versionHistory,
  };
}