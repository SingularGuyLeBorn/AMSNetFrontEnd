// MaskOperate/constants.tsx

// Bedrock V4.3 Change: Import and reuse the unified ClassInfo types
import type { ClassInfo, FileClassInfo } from '@/pages/FileOperate/constants';

export const RESIZE_HANDLE_SIZE = 8;

// ===================================================================
// 接口与类型定义 (Interfaces & Types)
// ===================================================================
export type Point = { x: number; y: number };

// Bedrock V4.3 Change: Unified class info definition (re-export for clarity)
export type { ClassInfo, FileClassInfo };

export interface BaseAnnotation {
  id: string;
  classIndex: number;
}

export interface ViewBoxAnnotation extends BaseAnnotation {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceLineWidth: number;
}

export interface ViewDiagonalAnnotation extends BaseAnnotation {
  points: [Point, Point];
  thickness: number;
}

export type ViewAnnotation = ViewBoxAnnotation | ViewDiagonalAnnotation;

export type ImageFileInfo = {
  name: string;
  url: string;
  originalFile: File;
  width: number;
  height: number;
};

// --- API 响应类型定义 ---
export interface ApiKeyPoint {
  id: number;
  net: string;
  type: string;
  x: number;
  y: number;
  port_id: number;
}

export interface ApiSegment {
  src_key_point_id: number;
  dst_key_point_id: number;
}

export interface ApiComponent {
  b: number;
  l: number;
  r: number;
  t: number;
  type: string;
  [key: string]: any;
}

export interface ApiResponse {
  key_points?: ApiKeyPoint[];
  segments?: ApiSegment[];
  cpnts?: ApiComponent[];
  // Bedrock Change: Add optional netlist fields for type safety
  netlist_scs?: string;
  netlist_cdl?: string;
  [key: string]: any;
}

// --- 数据存储结构 ---
export type ImageAnnotationData = {
  viewAnnotations: ViewAnnotation[];
  apiJson: ApiResponse;
};

// Bedrock V4.2 Change: Operation type is deprecated and replaced by the VersionHistory model in annotationStore.


// 定义默认的类别颜色映射
export const defaultCategoryColors: { [key: string]: string } = {
  'capacitor': 'rgba(255, 159, 64, 0.4)',
  'pmos': 'rgba(255, 99, 132, 0.4)',
  'nmos': 'rgba(54, 162, 235, 0.4)',
  'vdd': 'rgba(255, 206, 86, 0.4)',
  'gnd': 'rgba(75, 192, 192, 0.4)',
  'port': 'rgba(153, 102, 255, 0.4)',
  'resistor': 'rgba(201, 203, 207, 0.4)',
  'inductor': 'rgba(255, 99, 71, 0.4)',
  'diode': 'rgba(46, 204, 113, 0.4)',
  // Net 类别
  'net1': 'rgba(255, 99, 132, 0.6)',
  'net2': 'rgba(54, 162, 235, 0.6)',
  'net3': 'rgba(255, 206, 86, 0.6)',
  'net4': 'rgba(75, 192, 192, 0.6)',
  'net5': 'rgba(153, 102, 255, 0.6)',
  'net6': 'rgba(255, 159, 64, 0.6)',
  'unknown_net': 'rgba(128, 128, 128, 0.6)',
  'default': 'rgba(180, 180, 180, 0.4)',
};

// 为应用提供多语言文本支持
export const translations: { [key: string]: { [key: string]: string } } = {
  zh: {
    appName: '基石标注器',
    uploadFolder: '上传文件夹',
    exportAll: '导出全部 (ZIP)',
    settings: '设置',
    annotations: '标注列表',
    operationSuccessful: '操作成功',
    noImages: "请先上传文件夹",
    currentImage: "当前:",
    selectTool: '选择/移动工具',
    rectTool: '矩形工具',
    diagonalTool: '对角线工具',
    deleteTool: '删除工具',
    category: '当前类别',
    lineWidth: '线宽/厚度',
    toggleCategoryInBox: '框内显示类别名',
    clearAnnotationsButton: '清空当前JSON标注',
    deleteAnnotationTooltip: "删除此标注",
    thicknessLabel: "厚度",
    noAnnotations: "当前图片无标注",
    noCategoriesFound: "未找到类别，请先上传或添加",
    errorParseJsonFile: "解析JSON文件失败:",
    filesProcessed: "个文件已处理。",
    fileProcessingComplete: "文件处理完成。",
    exportingMessage: "正在导出所有数据...",
    exportSuccessMessage: "数据导出成功！",
    exportFailureMessage: "导出失败: ",
    aiAnnotate: 'AI 标注',
    aiAnnotating: 'AI 标注中...',
    aiFailed: "AI标注失败",
    classManagement: "类别管理",
    addClass: "新增类别",
    importClasses: "导入类别",
    exportClasses: "导出类别",
    className: "类别名称",
    hidePanel: '隐藏面板',
    showPanel: '显示面板',
    viewSettings: '视图设置',
    history: '历史记录',
    revert: '恢复',
    revertConfirmTitle: '确定要从此版本创建分支吗?',
    deleteClassConfirmTitle: '确认删除类别 “%s” ?',
    deleteClassConfirmContent: '此操作不可恢复，将删除所有图片中属于该类别的标注，并重新排列后续类别的索引。',
    importClassConfirmTitle: '确认导入类别?',
    importClassConfirmContent: '此操作将覆盖您当前的类别列表，请确认您已保存任何需要保留的设置。',
    confirmDelete: '确认删除',
    confirmImport: '确认导入',
    cancel: '取消',
    classDeleted: '类别 “%s” 已删除',
    rawData: '原始数据',
    magnifier: '放大镜',
    regionDelete: '区域删除',
    regionDeleteMode: '区域删除模式',
    fullyContained: '全包删除',
    intersecting: '接触删除',
  },
  en: {
    appName: 'Bedrock Annotator',
    uploadFolder: 'Upload Folder',
    exportAll: 'Export All (ZIP)',
    settings: 'Settings',
    annotations: 'Annotations',
    operationSuccessful: 'Operation successful',
    noImages: "Please upload a folder first",
    currentImage: "Current:",
    selectTool: 'Select/Move Tool',
    rectTool: 'Rectangle Tool',
    diagonalTool: 'Diagonal Tool',
    deleteTool: 'Delete Tool',
    category: 'Current Category',
    lineWidth: 'Line Width/Thickness',
    toggleCategoryInBox: 'Show Category in Box',
    clearAnnotationsButton: 'Clear Current JSON Annotations',
    deleteAnnotationTooltip: "Delete this annotation",
    thicknessLabel: "Thickness",
    noAnnotations: "No annotations for this image",
    noCategoriesFound: "No categories found, please upload or add one",
    errorParseJsonFile: "Failed to parse JSON file:",
    filesProcessed: "files processed.",
    fileProcessingComplete: "File processing complete.",
    exportingMessage: "Exporting all data...",
    exportSuccessMessage: "Data exported successfully!",
    exportFailureMessage: "Export failed: ",
    aiAnnotate: 'AI Annotate',
    aiAnnotating: 'AI Annotating...',
    aiFailed: "AI annotation failed",
    classManagement: "Class Management",
    addClass: "Add Class",
    importClasses: "Import Classes",
    exportClasses: "Export Classes",
    className: "Class Name",
    hidePanel: 'Hide Panel',
    showPanel: 'Show Panel',
    viewSettings: 'View Settings',
    history: 'History',
    revert: 'Revert',
    revertConfirmTitle: 'Are you sure you want to create a new branch from this version?',
    deleteClassConfirmTitle: 'Confirm deletion of class "%s"?',
    deleteClassConfirmContent: 'This action cannot be undone. It will remove all annotations of this class from all images and re-index subsequent classes.',
    importClassConfirmTitle: 'Confirm Class Import?',
    importClassConfirmContent: 'This will overwrite your current list of classes. Please ensure you have saved any settings you wish to keep.',
    confirmDelete: 'Confirm Delete',
    confirmImport: 'Confirm Import',
    cancel: 'Cancel',
    classDeleted: 'Class "%s" has been deleted',
    rawData: 'Raw Data',
    magnifier: 'Magnifier',
    regionDelete: 'Region Delete',
    regionDeleteMode: 'Region Delete Mode',
    fullyContained: 'Fully Contained',
    intersecting: 'Intersecting',
  },
};