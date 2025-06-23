// 定义了调整大小手柄的像素尺寸
export const RESIZE_HANDLE_SIZE = 8;

// 定义默认的类别颜色映射，为常见的电路元器件预设了颜色
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
    uploadFolder: '上传文件夹',
    exportAll: '导出全部',
    settings: '设置',
    annotations: '标注',
    operationSuccessful: '操作成功',
    noImages: "请先上传文件夹",
    currentImage: "当前:",
    // 工具提示
    selectTool: '选择/移动工具',
    rectTool: '矩形工具',
    diagonalTool: '对角线工具',
    deleteTool: '删除工具',
    aiAnnotate: 'AI 标注',
    // 设置面板
    classesFileSettings: '类别文件 (classes.txt)',
    uploadClassesFile: '上传类别文件',
    category: '当前类别',
    lineWidth: '线宽/厚度',
    annotationDisplaySource: '标注显示来源',
    sourceJson: 'JSON',
    sourceTxt: 'TXT',
    sourceNone: '不显示',
    toggleAnnotationsView: '显示/隐藏标注',
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
    noCategoriesFound: "未找到类别，请先上传",
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
    aiModelMode: "AI模型模式",
    initialDetection: "初始检测",
    optimization: "优化识别",
    aiFailed: "AI标注失败"
  },
  en: {
    // General
    uploadFolder: 'Upload Folder',
    exportAll: 'Export All',
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
    aiAnnotate: 'AI Annotate',
    // Settings Panel
    classesFileSettings: 'Classes File (classes.txt)',
    uploadClassesFile: 'Upload Classes File',
    category: 'Current Category',
    lineWidth: 'Line Width/Thickness',
    annotationDisplaySource: 'Annotation Source',
    sourceJson: 'JSON',
    sourceTxt: 'TXT',
    sourceNone: 'None',
    toggleAnnotationsView: 'Show/Hide Annotations',
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
    noCategoriesFound: "No categories found, please upload first",
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
    aiModelMode: "AI Model Mode",
    initialDetection: "Initial Detection",
    optimization: "Optimization",
    aiFailed: "AI annotation failed"
  },
};