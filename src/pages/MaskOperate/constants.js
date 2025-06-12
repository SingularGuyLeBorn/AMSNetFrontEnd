// MaskOperate/constants.js

/**
 * 默认的标注类别及其对应的颜色。
 * 这些颜色将在未通过 classes.txt 指定颜色时作为备用。
 * RGBA格式的最后一个值(alpha)控制透明度，以确保标注框不会完全遮挡图像。
 */
export const defaultCategoryColors = {
  "Object": "rgba(255, 99, 132, 0.4)",
  "Region": "rgba(54, 162, 235, 0.4)",
  "Line": "rgba(255, 206, 86, 0.4)",
  "Point": "rgba(75, 192, 192, 0.4)",
  "DefaultCategory1": "rgba(153, 102, 255, 0.4)",
  "DefaultCategory2": "rgba(255, 159, 64, 0.4)",
  "FallbackColor1": "rgba(201, 203, 207, 0.4)",
  "FallbackColor2": "rgba(253, 126, 20, 0.4)",
  "FallbackColor3": "rgba(111, 66, 193, 0.4)",
  "FallbackColor4": "rgba(32, 201, 151, 0.4)",
};

/**
 * 国际化文本资源。
 * 支持中文(zh)和英文(en)，可以方便地扩展其他语言。
 */
export const translations = {
  zh: {
    uploadFolder: "上传文件夹", undo: "撤销", exportAll: "导出全部 (ZIP)",
    previous: "上一张", next: "下一张", currentImage: "当前:",
    annotations: "标注列表", tools: "工具", settings: "设置",
    noAnnotations: "当前图片无标注", noImages: "请先上传文件夹",
    category: "选择类别", lineWidth: "线宽/斜线粗细",
    selectTool: "选择/移动", rectTool: "矩形工具", diagonalTool: "斜线工具", deleteTool: "删除工具",
    showSettingsPanel: "显示设置面板", showAnnotationsPanel: "显示标注列表",
    imageSize: "图像尺寸", mouseCoords: "鼠标坐标",
    diagonalArea: "斜线区域", positionAndSize: "位置与尺寸",
    uploadClassesFile: "上传 classes.txt", classesFileSettings: "类别配置 (classes.txt)",
    annotationDisplaySource: "标注显示来源", sourceJson: "JSON", sourceTxt: "TXT (YOLO)", sourceNone: "不显示历史标注",
    toggleAnnotationsView: "画布显示标注",
    toggleCategoryInBox: "框内显示类名",
    exportingMessage: "正在导出，请稍候...", exportSuccessMessage: "所有数据已成功导出!", exportFailureMessage: "导出失败:",
    noCategoriesFound: "未找到可用类别。请上传 classes.txt 或在代码中定义默认类别。",
    errorParseJsonFile: "解析JSON文件失败", errorParseJsonContent: "解析JSON内容失败 (单个标注)", errorParseTxtFile: "解析TXT文件失败", errorReadFileGeneric: "读取文件失败",
    deleteButtonText: "删除", deleteAnnotationTooltip: "删除此标注",
    originalFileNameLabel: "原始文件名", yoloFormatLabel: "YOLO 格式",
    operationSuccessful: "操作成功",
    noUndoOperations: "没有可撤销的操作",
    clearAnnotationsButton: "清空当前图片标注 (JSON源)",
    switchTooglePanels: "切换面板显示",
    thicknessLabel: "厚度",
    jsonLoadSuccess: "JSON文件加载成功并显示标注。",
    fileProcessingComplete: "文件处理完成。",
    filesProcessed: "张图片及关联标注已处理。",
    warningMissingFields: "警告: JSON标注缺少必要字段 (如 category, x, y, width, height 或 points)，已跳过。",
    categoryNotFoundInClasses: "提示: JSON中的新类别 '%s' 已添加。",
    jsonNotObjectError: "错误: JSON文件 '%s' 的顶层内容不是一个对象。请确保JSON文件以 `{` 开始，以 `}` 结束，并以类别为键。"
  },
  en: {
    uploadFolder: "Upload Folder", undo: "Undo", exportAll: "Export All (ZIP)",
    previous: "Previous", next: "Next", currentImage: "Current:",
    annotations: "Annotations", tools: "Tools", settings: "Settings",
    noAnnotations: "No annotations for this image", noImages: "Please upload a folder first",
    category: "Select Category", lineWidth: "Line Width/Diagonal Thickness",
    selectTool: "Select/Move", rectTool: "Rectangle Tool", diagonalTool: "Diagonal Tool", deleteTool: "Delete Tool",
    showSettingsPanel: "Show Settings Panel", showAnnotationsPanel: "Show Annotations List",
    imageSize: "Image Size", mouseCoords: "Mouse Coords",
    diagonalArea: "Diagonal Area", positionAndSize: "Position & Size",
    uploadClassesFile: "Upload classes.txt", classesFileSettings: "Categories (classes.txt)",
    annotationDisplaySource: "Annotation Display Source", sourceJson: "JSON", sourceTxt: "TXT (YOLO)", sourceNone: "Hide History Annotations",
    toggleAnnotationsView: "Show Annotations on Canvas",
    toggleCategoryInBox: "Show Category In Box",
    exportingMessage: "Exporting, please wait...", exportSuccessMessage: "All data exported successfully!", exportFailureMessage: "Export failed:",
    noCategoriesFound: "No categories available. Please upload classes.txt or define default categories in code.",
    errorParseJsonFile: "Failed to parse JSON file", errorParseJsonContent: "Failed to parse JSON content (single annotation)", errorParseTxtFile: "Failed to parse TXT file", errorReadFileGeneric: "Failed to read file",
    deleteButtonText: "Delete", deleteAnnotationTooltip: "Delete this annotation",
    originalFileNameLabel: "Original File Name", yoloFormatLabel: "YOLO Format",
    operationSuccessful: "Operation successful",
    noUndoOperations: "No operations to undo",
    clearAnnotationsButton: "Clear Annotations for Current Image (JSON source)",
    switchTooglePanels: "Toggle Panel Visibility",
    thicknessLabel: "Thickness",
    jsonLoadSuccess: "JSON file loaded and annotations displayed.",
    fileProcessingComplete: "File processing complete.",
    filesProcessed: "images and associated annotations processed.",
    warningMissingFields: "Warning: JSON annotation is missing required fields (e.g., category, x, y, width, height or points) and was skipped.",
    categoryNotFoundInClasses: "Info: New category '%s' from JSON has been added.",
    jsonNotObjectError: "Error: The top-level content of JSON file '%s' is not an object. Please ensure the JSON file starts with `{` and ends with `}`, with categories as keys."
  }
};

/**
 * 标注框缩放手柄在画布上的像素尺寸。
 */
export const RESIZE_HANDLE_SIZE = 8;

/**
 * 电路图组件类别常量 (根据您的数据整理)。
 * 注意：我已修正了原始数据中 "Other" 和 "Text" 条目间缺失的逗号，以确保其为有效的JavaScript对象。
 */
export const CLASSES = {
  "0": "capacitor",
  "1": "pmos",
  "2": "nmos",
  "3": "vdd",
  "4": "gnd",
  "5": "nmos-cross",
  "6": "current",
  "7": "cross-line-curved",
  "8": "port",
  "9": "resistor",
  "10": "npn",
  "11": "inductor",
  "12": "Box_ic",
  "13": "single-end-amp",
  "14": "diode",
  "15": "voltage",
  "16": "switch",
  "17": "pnp",
  "18": "nmos-bulk",
  "19": "voltage-lines",
  "20": "pmos-bulk",
  "21": "pmos-cross",
  "22": "switch-3",
  "23": "single-input-single-end-amp",
  "24": "diff-amp",
  "25": "resistor2_3",
  "26": "antenna",
  "27": "inductor-3",
  "28": "npn-cross",
  "29": "capacitor-3",
  "30": "pnp-cross",
  "31": "black-dot",
  "32": "Fuse",
  "33": "Opt",
  "34": "Buzzer",
  "35": "Crystal",
  "36": "Dc",
  "37": "Respack",
  "38": "M",
  "39": "cross",
  "40": "R_variable",
  "41": "R_thermal",
  "42": "D_schottky",
  "43": "C_pol",
  "44": "Box_header",
  "45": "Esd",
  "46": "Battery",
  "47": "SW_2port",
  "48": "SW_4port",
  "49": "SW_complex",
  "50": "Transfomer_norm",
  "51": "Transfomer_diff",
  "52": "Gdt",
  "53": "Silicon",
  "54": "LED",
  "55": "Other",
  "56": "Text"
};
