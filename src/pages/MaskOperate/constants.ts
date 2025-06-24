// MaskOperate/constants.ts

// 定义了调整大小手柄的像素尺寸
export const RESIZE_HANDLE_SIZE = 8;

// ===================================================================
// 接口与类型定义 (Interfaces & Types)
// ===================================================================
export type Point = { x: number; y: number };

export interface BaseAnnotation {
  id: string;
  category: string;
  color: string;
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

export type ImageAnnotationData = {
  jsonAnnotations: ViewAnnotation[];
  txtAnnotations: ViewAnnotation[];
  originalTxtFileContent?: string;
};

export type UndoOperation = {
  imageId: string;
  previousJsonAnnotations: ViewAnnotation[];
};


// 定义默认的类别颜色映射，为常见的电路元器件预设了颜色
// 这些颜色将在类别首次创建或未指定颜色时作为后备选项
export const defaultCategoryColors: { [key: string]: string } = {
  'capacitor': 'rgba(255, 159, 64, 0.4)',  // 橙色
  'pmos': 'rgba(255, 99, 132, 0.4)',     // 粉色
  'nmos': 'rgba(54, 162, 235, 0.4)',     // 蓝色
  'vdd': 'rgba(255, 206, 86, 0.4)',      // 黄色
  'gnd': 'rgba(75, 192, 192, 0.4)',      // 青色
  'port': 'rgba(153, 102, 255, 0.4)',    // 紫色
  'resistor': 'rgba(201, 203, 207, 0.4)',// 灰色
  'inductor': 'rgba(255, 99, 71, 0.4)',  // 番茄色
  'diode': 'rgba(46, 204, 113, 0.4)',    // 绿宝石色
};

// 为应用提供多语言文本支持
export const translations: { [key: string]: { [key: string]: string } } = {
  zh: {
    // 通用
    appName: '基石标注器',
    uploadFolder: '上传文件夹',
    exportAll: '导出全部 (ZIP)',
    settings: '设置',
    annotations: '标注列表',
    operationSuccessful: '操作成功',
    noImages: "请先上传文件夹",
    currentImage: "当前:",
    // 工具提示
    selectTool: '选择/移动工具',
    rectTool: '矩形工具',
    diagonalTool: '对角线工具',
    deleteTool: '删除工具',
    // 设置面板
    classesFileSettings: '类别文件 (classes.txt)',
    uploadClassesFile: '上传',
    exportClassesFile: '导出',
    importExportTooltip: "导入/导出类别文件",
    category: '当前类别',
    lineWidth: '线宽/厚度',
    annotationDisplaySource: '标注显示来源',
    sourceJson: 'JSON',
    sourceTxt: 'TXT',
    sourceNone: '不显示',
    toggleAnnotationsView: '画布上显示/隐藏标注',
    toggleCategoryInBox: '框内显示类别名',
    clearAnnotationsButton: '清空当前JSON标注',
    deleteAnnotationTooltip: "删除此标注",
    // 标注列表
    originalFileNameLabel: "源文件名",
    positionAndSize: "位置与尺寸",
    yoloFormatLabel: "YOLO 格式",
    diagonalArea: "对角线区域",
    thicknessLabel: "厚度",
    // 消息
    noAnnotations: "当前图片无标注",
    noCategoriesFound: "未找到类别，请先上传或添加",
    errorReadFileGeneric: "读取文件失败:",
    errorParseJsonFile: "解析JSON文件失败:",
    errorParseTxtFile: "解析TXT文件失败:",
    jsonNotObjectError: "JSON文件 %s 格式错误：顶层应为对象。",
    categoryNotFoundInClasses: "在JSON中发现新类别'%s'，已自动添加。",
    filesProcessed: "个文件已处理。",
    jsonLoadSuccess: "已加载。",
    fileProcessingComplete: "文件处理完成。",
    exportingMessage: "正在导出所有数据...",
    exportSuccessMessage: "数据导出成功！",
    exportFailureMessage: "导出失败: ",
    // AI功能
    aiAnnotate: 'AI 标注',
    aiAnnotating: 'AI 标注中...',
    aiModelMode: "AI模型模式",
    initialDetection: "初始检测",
    optimization: "优化识别",
    aiFailed: "AI标注失败",
    aiModeAuto: '自动',
    aiModeManual: '手动',
    // 类别管理
    classManagement: "类别管理",
    addClass: "新增类别",
    className: "类别名称",
    classColor: "颜色",
    hidePanel: '隐藏面板',
    showPanel: '显示面板',
  },
  en: {
    // General
    appName: 'Bedrock Annotator',
    uploadFolder: 'Upload Folder',
    exportAll: 'Export All (ZIP)',
    settings: 'Settings',
    annotations: 'Annotations',
    operationSuccessful: 'Operation successful',
    noImages: "Please upload a folder first",
    currentImage: "Current:",
    // Tooltips
    selectTool: 'Select/Move Tool',
    rectTool: 'Rectangle Tool',
    diagonalTool: 'Diagonal Tool',
    deleteTool: 'Delete Tool',
    // Settings Panel
    classesFileSettings: 'Classes File (classes.txt)',
    uploadClassesFile: 'Upload',
    exportClassesFile: 'Export',
    importExportTooltip: "Import/Export Classes File",
    category: 'Current Category',
    lineWidth: 'Line Width/Thickness',
    annotationDisplaySource: 'Annotation Source',
    sourceJson: 'JSON',
    sourceTxt: 'TXT',
    sourceNone: 'None',
    toggleAnnotationsView: 'Show/Hide Annotations on Canvas',
    toggleCategoryInBox: 'Show Category in Box',
    clearAnnotationsButton: 'Clear Current JSON Annotations',
    deleteAnnotationTooltip: "Delete this annotation",
    // Annotation List
    originalFileNameLabel: "Source File Name",
    positionAndSize: "Position & Size",
    yoloFormatLabel: "YOLO Format",
    diagonalArea: "Diagonal Area",
    thicknessLabel: "Thickness",
    // Messages
    noAnnotations: "No annotations for this image",
    noCategoriesFound: "No categories found, please upload or add one",
    errorReadFileGeneric: "Failed to read file:",
    errorParseJsonFile: "Failed to parse JSON file:",
    errorParseTxtFile: "Failed to parse TXT file:",
    jsonNotObjectError: "JSON file %s format error: top level should be an object.",
    categoryNotFoundInClasses: "New category '%s' found in JSON, added automatically.",
    filesProcessed: "files processed.",
    jsonLoadSuccess: "loaded.",
    fileProcessingComplete: "File processing complete.",
    exportingMessage: "Exporting all data...",
    exportSuccessMessage: "Data exported successfully!",
    exportFailureMessage: "Export failed: ",
    // AI Features
    aiAnnotate: 'AI Annotate',
    aiAnnotating: 'AI Annotating...',
    aiModelMode: "AI Model Mode",
    initialDetection: "Initial Detection",
    optimization: "Optimization",
    aiFailed: "AI annotation failed",
    aiModeAuto: 'Auto',
    aiModeManual: 'Manual',
    // Class Management
    classManagement: "Class Management",
    addClass: "Add Class",
    className: "Class Name",
    classColor: "Color",
    hidePanel: 'Hide Panel',
    showPanel: 'Show Panel',
  },
};