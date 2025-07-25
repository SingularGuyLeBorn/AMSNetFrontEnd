/**
 * @description 标注类别信息的接口定义
 */
export interface ClassInfo {
  label: string;
  color: string;
}

/**
 * @description For file import/export contract
 */
export interface FileClassInfo extends ClassInfo {
  index: number;
}

// Bedrock Change: Unified API response type definitions, aligned with MaskOperate
// This ensures consistency when processing data from the shared backend.
export interface ApiComponent {
  b: number; // bottom
  l: number; // left
  r: number; // right
  t: number; // top
  type: string;
  name: string; // The unique identifier for the component instance, derived from YOLO data.
  // Allows for other potential fields from the API
  [key: string]: any;
}

export interface ApiResponse {
  cpnts?: ApiComponent[];
  // Retaining optional definitions for key_points and segments to enhance type safety
  key_points?: any[];
  segments?: any[];
  // Bedrock Change: Add optional netlist fields for type safety, matching MaskOperate
  netlist_scs?: string;
  netlist_cdl?: string;
  // Allows for other top-level keys in the response
  [key: string]: any;
}


// Bedrock V4.2 Change: Operation type is deprecated and replaced by the VersionHistory model in annotationStore.

/**
 * @description 初始的标注类别索引与其颜色、标签的映射关系。
 */
export const initialIndexClassColorMap: { [key: number]: ClassInfo } = {
  0: { label: 'capacitor', color: '#ff0000' }, 1: { label: 'pmos', color: '#00ff00' },
  2: { label: 'nmos', color: '#0000ff' }, 3: { label: 'vdd', color: '#ffff00' },
  4: { label: 'gnd', color: '#ff00ff' }, 5: { label: 'nmos-cross', color: '#00ffff' },
  6: { label: 'current', color: '#800000' }, 7: { label: 'cross-line-curved', color: '#008000' },
  8: { label: 'port', color: '#000080' }, 9: { label: 'resistor', color: '#808000' },
  10: { label: 'npn', color: '#800080' }, 11: { label: 'inductor', color: '#008080' },
  12: { label: 'Box_ic', color: '#c0c0c0' }, 13: { label: 'single-end-amp', color: '#808080' },
  14: { label: 'diode', color: '#ff6600' }, 15: { label: 'voltage', color: '#ffcc00' },
  16: { label: 'switch', color: '#ccff00' }, 17: { label: 'pnp', color: '#00ffcc' },
  18: { label: 'nmos-bulk', color: '#00ccff' }, 19: { label: 'voltage-lines', color: '#6600ff' },
  20: { label: 'pmos-bulk', color: '#cc00ff' }, 21: { label: 'pmos-cross', color: '#ff00cc' },
  22: { label: 'switch-3', color: '#ff9999' }, 23: { label: 'single-input-single-end-amp', color: '#99ff99' },
  24: { label: 'diff-amp', color: '#9999ff' }, 25: { label: 'resistor2_3', color: '#ffff99' },
  26: { label: 'antenna', color: '#99ffcc' }, 27: { label: 'inductor-3', color: '#cc99ff' },
  28: { label: 'npn-cross', color: '#ff99cc' }, 29: { label: 'capacitor-3', color: '#ffcc99' },
  30: { label: 'pnp-cross', color: '#ccff99' }, 31: { label: 'black-dot', color: '#99ccff' },
};

/**
 * @description JSON文件中组件名称 (jsonName) 与其染色时使用的颜色映射。
 */
export const jsonNameColorMap: { [key: string]: string } = {
  'opamp': '#FFDDC1', 'resistor': '#C1FFD7', 'capacitor': '#C1D4FF', 'switch': '#F0C1FF',
  'common_source_unloaded': '#FFC1C1', 'common_gate_unloaded': '#FFEAC1', 'source_follower_unloaded': '#E0FFC1',
  'common_source': '#C1FFE5', 'common_gate': '#C1E0FF', 'source_follower': '#D4C1FF',
  'cascode_unloaded': '#F0C1FF', 'cascode': '#FFC1E0', 'differential_pair': '#C1FFD4',
  'current_mirror': '#D4C1FF', 'current_source': '#FFD4C1', 'load': '#C1FFD4',
};

interface TranslationSet {
  [key: string]: string;
}

export const translations: { [key: string]: TranslationSet } = {
  zh: {
    uploadFolder: '上传文件夹', undo: '撤销', redo: '重做', save: '保存', deleteBox: '删除框', category: '标注类别', previous: '上一张', next: '下一张', currentFile: '当前文件', coloringMode: '染色模式', drawingMode: '绘制模式', delete: '删除', saveAll: '导出全部 (ZIP)', chooseJsonName: '选择组件名称 (染色用)', chooseJsonType: '选择组件类型 (染色用)', noFile: '没有可操作的文件', dataExplorer: '数据浏览', settings: '设置', annotations: '标注列表', currentImage: "当前:", noAnnotations: "当前图片无标注", noImages: "请先上传文件夹", selectTool: "选择/移动", operationSuccessful: "操作成功", noUndoOperations: "没有可撤销的操作", noRedoOperations: "没有可重做的的操作", aiAnnotation: 'AI 自动标注', aiAnnotating: 'AI 标注中...', aiFailed: "AI标注失败", apiMode: 'API 模式', apiModeAuto: '自动', apiModeManual: '手动', manualApiEndpoint: '手动选择 API', apiForNew: '新图标注 API', apiForIncremental: '增量标注 API', classManagement: '类别管理', addClass: '新增类别', importClasses: '导入类别', exportClasses: '导出类别', className: '类别名称', hidePanel: '隐藏面板', showPanel: '显示面板', rawData: '原始数据', history: '历史记录', revert: '恢复', revertConfirmTitle: '确定要从此版本创建分支吗?',
    deleteClassConfirmTitle: '确认删除类别 “%s” ?',
    deleteClassConfirmContent: '此操作不可恢复，将删除所有文件中该类别的标注，并重新排列后续类别的索引。',
    importClassConfirmTitle: '确认导入类别?',
    importClassConfirmContent: '此操作将覆盖您当前的类别列表，请确认您已保存任何需要保留的设置。',
    confirmDelete: '确认删除',
    confirmImport: '确认导入',
    cancel: '取消',
    classDeleted: '类别 “%s” 已删除',
    deleteAnnotationTooltip: '删除此标注',
    magnifier: '放大镜',
    regionDelete: '区域删除',
    regionDeleteMode: '区域删除模式',
    fullyContained: '全包删除',
    intersecting: '接触删除',
    toggleCategoryInBox: '框内显示类别名',
    viewSettings: '视图与标注设置',
    clearAnnotationsButton: '清空当前标注',
  },
  en: {
    uploadFolder: 'Upload Folder', undo: 'Undo', redo: 'Redo', save: 'Save', deleteBox: 'Delete Box', category: 'Category', previous: 'Previous', next: 'Next', currentFile: 'Current File', coloringMode: 'Coloring Mode', drawingMode: 'Drawing Mode', delete: 'Delete', saveAll: 'Export All (ZIP)', chooseJsonName: 'Choose Component (for coloring)', chooseJsonType: 'Choose Type (for coloring)', noFile: 'No files to operate on', dataExplorer: 'Data Explorer', settings: 'Settings', annotations: 'Annotations', currentImage: "Current:", noAnnotations: "No annotations for this image", noImages: "Please upload a folder first", selectTool: "Select/Move", operationSuccessful: "Operation successful", noUndoOperations: "No operations to undo", noRedoOperations: "No operations to redo", aiAnnotation: 'AI Auto-Annotation', aiAnnotating: 'AI Annotating...', aiFailed: "AI Annotation Failed", apiMode: 'API Mode', apiModeAuto: 'Auto', apiModeManual: 'Manual', manualApiEndpoint: 'Manual API Selection', apiForNew: 'API for New Image', apiForIncremental: 'API for Incremental', classManagement: 'Class Management', addClass: 'Add Class', importClasses: 'Import Classes', exportClasses: 'Export Classes', className: 'Class Name', hidePanel: 'Hide Panel', showPanel: 'Show Panel', rawData: 'Raw Data', history: 'History', revert: 'Revert', revertConfirmTitle: 'Are you sure you want to create a new branch from this version?',
    deleteClassConfirmTitle: 'Confirm deletion of class "%s"?',
    deleteClassConfirmContent: 'This action cannot be undone. It will remove all annotations of this class from all files and re-index subsequent classes.',
    importClassConfirmTitle: 'Confirm Class Import?',
    importClassConfirmContent: 'This will overwrite your current list of classes. Please ensure you have saved any settings you wish to keep.',
    confirmDelete: 'Confirm Delete',
    confirmImport: 'Confirm Import',
    cancel: 'Cancel',
    classDeleted: 'Class "%s" has been deleted',
    deleteAnnotationTooltip: 'Delete this annotation',
    magnifier: 'Magnifier',
    regionDelete: 'Region Delete',
    regionDeleteMode: 'Region Delete Mode',
    fullyContained: 'Fully Contained',
    intersecting: 'Intersecting',
    toggleCategoryInBox: 'Show category in box',
    viewSettings: 'View & Annotation Settings',
    clearAnnotationsButton: 'Clear Current Annotations',
  }
};