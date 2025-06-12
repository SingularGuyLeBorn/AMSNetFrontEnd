// MaskOperate/types.ts

export type Point = { x: number; y: number };

export type ViewBoxAnnotation = {
  id: string;
  x: number; y: number; width: number; height: number;
  category: string; color: string; sourceLineWidth: number;
};

export type ViewDiagonalAnnotation = {
  id: string;
  points: [Point, Point];
  category: string; color: string; thickness: number;
};

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

export type ActiveTool = 'select' | 'rectangle' | 'diagonal' | 'delete';

export type AnnotationSourceType = 'json' | 'txt' | 'none';

export type ResizeHandle = 'topLeft' | 'top' | 'topRight' | 'left' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight';

export type DraggingState = {
  type: 'move' | 'resize';
  handle?: ResizeHandle;
  startMousePos: Point;
  startAnnotationState: ViewAnnotation;
} | null;
