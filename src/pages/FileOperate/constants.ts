// FileOperate/constants.ts

/**
 * @description 标注类别信息的接口定义
 */
export interface ClassInfo {
  label: string;
  color: string;
}

/**
 * @description 标注类别索引与其颜色、标签的映射关系。
 * 这是手动标注（画框）时，用户选择的类别列表及其在画布上显示的颜色。
 */
export const indexClassColorMap: { [key: number]: ClassInfo } = {
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
  // 可以根据需要继续添加更多类别
};

/**
 * @description JSON文件中组件名称 (jsonName) 与其染色时使用的颜色映射。
 * 当启用“染色模式”并点击画布上的标注框时，会使用此处的颜色对框进行染色，
 * 以视觉化地表示该框与JSON数据中某个特定组件的关联。
 */
export const jsonNameColorMap: { [key: string]: string } = {
  'opamp': '#FFDDC1', 'resistor': '#C1FFD7', 'capacitor': '#C1D4FF', 'switch': '#F0C1FF',
  'common_source_unloaded': '#FFC1C1', 'common_gate_unloaded': '#FFEAC1', 'source_follower_unloaded': '#E0FFC1',
  'common_source': '#C1FFE5', 'common_gate': '#C1E0FF', 'source_follower': '#D4C1FF',
  'cascode_unloaded': '#F0C1FF', 'cascode': '#FFC1E0', 'differential_pair': '#C1FFD4',
  'current_mirror': '#D4C1FF', 'current_source': '#FFD4C1', 'load': '#C1FFD4',
  // 可以根据实际的JSON数据中的组件名称添加更多映射
};

/**
 * @description 单个语言的文本资源接口
 */
interface TranslationSet {
  [key: string]: string;
}

/**
 * @description 国际化文本资源。
 * 为应用内所有静态文本提供多语言支持。
 */
export const translations: { [key: string]: TranslationSet } = {
  zh: {
    uploadFolder: '上传文件夹',
    undo: '撤销',
    redo: '重做',
    save: '保存',
    deleteBox: '删除选中框',
    restoreDeleted: '恢复删除',
    category: '标注类别',
    previous: '上一张',
    next: '下一张',
    currentFile: '当前文件',
    function: '高级功能',
    coloringMode: '染色模式',
    drawingMode: '绘制模式',
    addProperty: '增加属性',
    addNode: '添加节点',
    nodeName: '节点名称',
    key: '键',
    value: '值',
    delete: '删除',
    saveCurrent: '保存当前',
    saveAll: '导出全部 (ZIP)',
    chooseJsonName: '选择组件名称 (染色用)',
    chooseJsonType: '选择组件类型 (染色用)',
    noFile: '没有可操作的文件',
    noDeletedBoxes: '没有可恢复的删除框',
    fileManagement: '文件',
    annotationTools: '工具',
    actions: '操作',
    dataExplorer: '数据浏览',
    settings: '设置',
    annotations: '标注列表',
    currentImage: "当前:",
    noAnnotations: "当前图片无标注",
    noImages: "请先上传文件夹",
    lineWidth: "线宽",
    selectTool: "选择/移动",
    rectTool: "矩形工具",
    clearAnnotationsButton: "清空当前图片标注",
    operationSuccessful: "操作成功",
    noUndoOperations: "没有可撤销的操作",
    noRedoOperations: "没有可重做的操作",
  },
  en: {
    uploadFolder: 'Upload Folder',
    undo: 'Undo',
    redo: 'Redo',
    save: 'Save',
    deleteBox: 'Delete Selected',
    restoreDeleted: 'Restore Deleted',
    category: 'Category',
    previous: 'Previous',
    next: 'Next',
    currentFile: 'Current File',
    function: 'Advanced Functions',
    coloringMode: 'Coloring Mode',
    drawingMode: 'Drawing Mode',
    addProperty: 'Add Property',
    addNode: 'Add Node',
    nodeName: 'Node Name',
    key: 'Key',
    value: 'Value',
    delete: 'Delete',
    saveCurrent: 'Save Current',
    saveAll: 'Export All (ZIP)',
    chooseJsonName: 'Choose Component (for coloring)',
    chooseJsonType: 'Choose Type (for coloring)',
    noFile: 'No files to operate on',
    noDeletedBoxes: 'No deleted boxes to restore',
    fileManagement: 'Files',
    annotationTools: 'Tools',
    actions: 'Actions',
    dataExplorer: 'Data Explorer',
    settings: 'Settings',
    annotations: 'Annotations',
    currentImage: "Current:",
    noAnnotations: "No annotations for this image",
    noImages: "Please upload a folder first",
    lineWidth: "Line Width",
    selectTool: "Select/Move",
    rectTool: "Rectangle Tool",
    clearAnnotationsButton: "Clear Annotations for Current Image",
    operationSuccessful: "Operation successful",
    noUndoOperations: "No operations to undo",
    noRedoOperations: "No operations to redo",
  }
};