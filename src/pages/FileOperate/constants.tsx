// FILE: src/pages/FileOperate/constants.tsx
// START OF FILE src/pages/FileOperate/constants.tsx
/**
 * @description 标注类别信息的接口定义
 */
export interface ClassInfo {
  label: string;
  color: string;
}

/**
 * @description Bedrock Change: 与MaskOperate对齐的统一API组件类型定义，确保数据处理一致性
 */
export interface ApiComponent {
  b: number; // bottom
  l: number; // left
  r: number; // right
  t: number; // top
  type: string;
  // 允许API返回其他潜在字段
  [key: string]: any;
}

/**
 * @description Bedrock Change: 统一的API响应类型，增强类型安全
 */
export interface ApiResponse {
  cpnts?: ApiComponent[];
  // 保留 key_points 和 segments 的可选定义以增强类型安全
  key_points?: any[];
  segments?: any[];
  // 允许响应中存在其他顶层键
  [key: string]: any;
}

/**
 * @description 操作历史记录的类型定义
 */
export type Operation =
    | { type: 'draw'; yoloData: string[]; previousYoloContent: string | null }
    | { type: 'ai_annotate'; yoloData: string[]; previousYoloContent: string | null }
    | { type: 'stain'; boxName: string; jsonType: string; jsonName: string; previousJsonContent: string | null }
    | { type: 'delete'; deletedLines: { index: number; content: string }[]; previousYoloContent: string | null; previousJsonContent: string | null; }
    | { type: 'json_change'; previousJsonContent: string | null; currentJsonContent: string | null }
    | { type: 'move'; previousYoloContent: string | null };

/**
 * @description 初始的标注类别索引与其颜色、标签的映射关系。
 */
export const initialIndexClassColorMap: { [key: number]: ClassInfo } = {
  0: { label: 'capacitor', color: '#ff0000' },
  1: { label: 'pmos', color: '#00ff00' },
  2: { label: 'nmos', color: '#0000ff' },
  3: { label: 'vdd', color: '#ffff00' },
  4: { label: 'gnd', color: '#ff00ff' },
  5: { label: 'nmos-cross', color: '#00ffff' },
  6: { label: 'current', color: '#800000' },
  7: { label: 'cross-line-curved', color: '#008000' },
  8: { label: 'port', color: '#000080' },
  9: { label: 'resistor', color: '#808000' },
  10: { label: 'npn', color: '#808080' },
  11: { label: 'inductor', color: '#008080' },
  12: { label: 'Box_ic', color: '#c0c0c0' },
  13: { label: 'single-end-amp', color: '#808080' },
  14: { label: 'diode', color: '#ff6600' },
  15: { label: 'voltage', color: '#ffcc00' },
  16: { label: 'switch', color: '#ccff00' },
  17: { label: 'pnp', color: '#00ffcc' },
  18: { label: 'nmos-bulk', color: '#00ccff' },
  19: { label: 'voltage-lines', color: '#6600ff' },
  20: { label: 'pmos-bulk', color: '#cc00ff' },
  21: { label: 'pmos-cross', color: '#ff00cc' },
  22: { label: 'switch-3', color: '#ff9999' },
  23: { label: 'single-input-single-end-amp', color: '#99ff99' },
  24: { label: 'diff-amp', color: '#9999ff' },
  25: { label: 'resistor2_3', color: '#ffff99' },
  26: { label: 'antenna', color: '#99ffcc' },
  27: { label: 'inductor-3', color: '#cc99ff' },
  28: { label: 'npn-cross', color: '#ff99cc' },
  29: { label: 'capacitor-3', color: '#ffcc99' },
  30: { label: 'pnp-cross', color: '#ccff99' },
  31: { label: 'black-dot', color: '#99ccff' },
};

/**
 * @description JSON文件中组件名称 (jsonName) 与其染色时使用的颜色映射。
 */
export const jsonNameColorMap: { [key: string]: string } = {
  'opamp': '#FFDDC1',
  'resistor': '#C1FFD7',
  'capacitor': '#C1D4FF',
  'switch': '#F0C1FF',
  'common_source_unloaded': '#FFC1C1',
  'common_gate_unloaded': '#FFEAC1',
  'source_follower_unloaded': '#E0FFC1',
  'common_source': '#C1FFE5',
  'common_gate': '#C1E0FF',
  'source_follower': '#D4C1FF',
  'cascode_unloaded': '#F0C1FF',
  'cascode': '#FFC1E0',
  'differential_pair': '#C1FFD4',
  'current_mirror': '#D4C1FF',
  'current_source': '#FFD4C1',
  'load': '#C1FFD4',
};

interface TranslationSet {
  [key: string]: string;
}

export const translations: { [key: string]: TranslationSet } = {
  zh: {
    uploadFolder: '上传文件夹',
    undo: '撤销',
    redo: '重做',
    save: '保存',
    deleteBox: '删除框',
    category: '标注类别',
    previous: '上一张',
    next: '下一张',
    currentFile: '当前文件',
    coloringMode: '知识图谱标注',
    drawingMode: '绘制模式',
    delete: '删除',
    saveAll: '导出全部 (ZIP)',
    chooseJsonName: '选择组件名称 ',
    chooseJsonType: '选择组件类型 ',
    noFile: '没有可操作的文件',
    dataExplorer: '数据浏览',
    settings: '设置',
    annotations: '标注列表',
    currentImage: "当前:",
    noAnnotations: "当前图片无标注",
    noImages: "请先上传文件夹",
    selectTool: "选择/移动",
    operationSuccessful: "操作成功",
    noUndoOperations: "没有可撤销的操作",
    noRedoOperations: "没有可重做的的操作",
    aiAnnotation: 'AI 自动标注',
    aiAnnotating: 'AI 标注中...',
    aiFailed: "AI标注失败",
    apiMode: 'API 模式',
    apiModeAuto: '自动',
    apiModeManual: '手动',
    manualApiEndpoint: '手动选择 API',
    apiForNew: '新图标注 API',
    apiForIncremental: '增量标注 API',
    classManagement: '类别管理',
    addClass: '新增类别',
    importClasses: '导入类别',
    exportClasses: '导出类别',
    className: '类别名称',
    hidePanel: '隐藏面板',
    showPanel: '显示面板',
    rawData: '原始数据',
    deleteClassConfirmTitle: '确认删除类别 %s?',
    deleteClassConfirmContent: '此操作不可恢复，将删除所有图片中属于该类别的标注。',
    confirmDelete: '确认删除',
    cancel: '取消',
    classDeleted: '类别 %s 已删除',
    deleteAnnotationTooltip: '删除此标注',
    magnifier: '放大镜',
    regionDelete: '区域删除',
    regionDeleteMode: '区域删除模式',
    fullyContained: '全包删除',
    intersecting: '接触删除',
    fileExplorer: '文件浏览器',
    searchFiles: '搜索文件...',
    annotationHistory: '标注历史',
    noHistory: '此图片无历史记录',
    showExplorer: '显示文件浏览器',
    hideExplorer: '隐藏文件浏览器',
    opDraw: '绘制: %s',
    opAi: 'AI标注: 新增 %s 个',
    opStain: '染色: %s',
    opDelete: '删除: %s',
    opJson: 'JSON变更',
    opMove: '移动/缩放',
    kgOperations: '知识图谱操作',
    nodeOperations: '节点操作',
    relationshipOperations: '关系操作',
    nodeName: '节点名称',
    nodeProperties: '节点属性',
    relationshipName: '关系名称',
    relationshipProperties: '关系属性',
    createNode: '创建节点',
    updateNode: '更新节点',
    findNode: '查询节点',
    deleteNode: '删除节点',
    createRelationship: '创建关系',
    updateRelationship: '更新关系',
    findRelationship: '查询关系',
    deleteRelationship: '删除关系',
    addProperty: '添加属性',
    propKey: '属性名 (Key)',
    propValue: '属性值 (Value)',
    fromNodeHelp: '请在此处属性中添加 fromNode 和 toNode',
    addComponent: '添加组件',
    newComponentName: '新组件名称',
    componentManagement: '组件管理',
    componentName: '组件名称',
    deleteComponentConfirmTitle: '确认删除组件 %s?',
    deleteComponentConfirmContent: '此操作不可恢复，将清除所有图片中对该组件的染色引用。',
    componentDeleted: '组件 %s 已删除',
    typeManagement: '类型管理',
    typeName: '类型名称',
    addType: '添加类型',
    newTypeName: '新类型名称',
    deleteTypeConfirmTitle: '确认删除类型 %s?',
    deleteTypeConfirmContent: '此操作不可恢复，将清除所有图片中属于该类型的所有组件染色引用。',
    typeDeleted: '类型 %s 已删除',
    knowledgeGraph: '知识图谱',
  },
  en: {
    uploadFolder: 'Upload Folder',
    undo: 'Undo',
    redo: 'Redo',
    save: 'Save',
    deleteBox: 'Delete Box',
    category: 'Category',
    previous: 'Previous',
    next: 'Next',
    currentFile: 'Current File',
    coloringMode: 'KG Labeling',
    drawingMode: 'Drawing Mode',
    delete: 'Delete',
    saveAll: 'Export All (ZIP)',
    chooseJsonName: 'Choose Component ',
    chooseJsonType: 'Choose Type ',
    noFile: 'No files to operate on',
    dataExplorer: 'Data Explorer',
    settings: 'Settings',
    annotations: 'Annotations',
    currentImage: "Current:",
    noAnnotations: "No annotations for this image",
    noImages: "Please upload a folder first",
    selectTool: "Select/Move",
    operationSuccessful: "Operation successful",
    noUndoOperations: "No operations to undo",
    noRedoOperations: "No operations to redo",
    aiAnnotation: 'AI Auto-Annotation',
    aiAnnotating: 'AI Annotating...',
    aiFailed: "AI Annotation Failed",
    apiMode: 'API Mode',
    apiModeAuto: 'Auto',
    apiModeManual: 'Manual',
    manualApiEndpoint: 'Manual API Selection',
    apiForNew: 'API for New Image',
    apiForIncremental: 'API for Incremental',
    classManagement: 'Class Management',
    addClass: 'Add Class',
    importClasses: 'Import Classes',
    exportClasses: 'Export Classes',
    className: 'Class Name',
    hidePanel: 'Hide Panel',
    showPanel: 'Show Panel',
    rawData: 'Raw Data',
    deleteClassConfirmTitle: 'Confirm deletion of class %s?',
    deleteClassConfirmContent: 'This action cannot be undone and will remove all annotations of this class from all images.',
    confirmDelete: 'Confirm Delete',
    cancel: 'Cancel',
    classDeleted: 'Class %s has been deleted',
    deleteAnnotationTooltip: 'Delete this annotation',
    magnifier: 'Magnifier',
    regionDelete: 'Region Delete',
    regionDeleteMode: 'Region Delete Mode',
    fullyContained: 'Fully Contained',
    intersecting: 'Intersecting',
    fileExplorer: 'File Explorer',
    searchFiles: 'Search files...',
    annotationHistory: 'Annotation History',
    noHistory: 'No history for this image',
    showExplorer: 'Show File Explorer',
    hideExplorer: 'Hide File Explorer',
    opDraw: 'Draw: %s',
    opAi: 'AI-Annotate: Added %s',
    opStain: 'Stain: %s',
    opDelete: 'Delete: %s',
    opJson: 'JSON Change',
    opMove: 'Move/Resize',
    kgOperations: 'Knowledge Graph Ops',
    nodeOperations: 'Node Ops',
    relationshipOperations: 'Relationship Ops',
    nodeName: 'Node Name',
    nodeProperties: 'Node Properties',
    relationshipName: 'Relationship Name',
    relationshipProperties: 'Relationship Properties',
    createNode: 'Create Node',
    updateNode: 'Update Node',
    findNode: 'Find Node',
    deleteNode: 'Delete Node',
    createRelationship: 'Create Relationship',
    updateRelationship: 'Update Relationship',
    findRelationship: 'Find Relationship',
    deleteRelationship: 'Delete Relationship',
    addProperty: 'Add Property',
    propKey: 'Property Key',
    propValue: 'Property Value',
    fromNodeHelp: 'Add fromNode and toNode in properties here',
    addComponent: 'Add Component',
    newComponentName: 'New Component Name',
    componentManagement: 'Component Management',
    componentName: 'Component Name',
    deleteComponentConfirmTitle: 'Confirm deletion of component %s?',
    deleteComponentConfirmContent: 'This action is irreversible and will clear all staining references to this component across all images.',
    componentDeleted: 'Component %s has been deleted',
    typeManagement: 'Type Management',
    typeName: 'Type Name',
    addType: 'Add Type',
    newTypeName: 'New Type Name',
    deleteTypeConfirmTitle: 'Confirm deletion of type %s?',
    deleteTypeConfirmContent: 'This action is irreversible and will clear all staining references of this type across all images.',
    typeDeleted: 'Type %s has been deleted',
    knowledgeGraph: 'Knowledge Graph',
  },
};
// END OF FILE: src/pages/FileOperate/constants.tsx
