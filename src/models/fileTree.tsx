// START OF FILE src/models/fileTree.tsx
/**
 * @description Represents a file node in the file tree.
 *              This is always a leaf node.
 */
export type FileNode = {
    key: string;      // A unique identifier, typically the full relative path. e.g., 'data/images/001.png'
    title: string;    // The display name of the file. e.g., '001.png'
    isLeaf: true;
    file: File;       // The original File object.
};

/**
 * @description Represents a directory node in the file tree.
 *              This can contain other directories or files.
 */
export type DirectoryNode = {
    key: string;       // A unique identifier, typically the full relative path. e.g., 'data/images'
    title: string;     // The display name of the directory. e.g., 'images'
    isLeaf: false;
    children: FileTreeNode[]; // An array of child nodes (can be FileNode or DirectoryNode).
};

/**
 * @description A union type representing any node in the file tree.
 */
export type FileTreeNode = FileNode | DirectoryNode;
// END OF FILE src/models/fileTree.tsx