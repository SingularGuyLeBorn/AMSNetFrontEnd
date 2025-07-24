// FILE: src/models/workspaceService.tsx
import { saveAs } from 'file-saver';
import { IDBPDatabase, openDB } from 'idb';
import JSZip from 'jszip';

// ===================================================================
// 类型定义 (Type Definitions)
// ===================================================================

/**
 * @description Bedrock Change: 文件在IndexedDB中的存储结构，使用File对象替代句柄
 */
interface StoredFiles {
    baseName: string;
    pngFile: File;
    yoloFile?: File;
    jsonFile?: File;
}

/**
 * @description 工作区信息在IndexedDB中的存储结构
 */
interface WorkspaceInfo {
    // Bedrock Change: 移除 sourceDirectoryHandle, 因为 File 对象无法被持久化
    // Bedrock Change: 保留 baseExportDirectoryHandle 但注释其局限性
    /** @deprecated File System Access API is not available in non-secure contexts (HTTP) */
    baseExportDirectoryHandle?: FileSystemDirectoryHandle;
    imageKeys: string[]; // 排序后的图片文件名列表 (e.g., 'image_001.png')
    lastFileOperateIndex: number;
    lastMaskOperateIndex: number;
}

// ===================================================================
// IndexedDB 数据库配置 (IndexedDB Configuration)
// ===================================================================

const DB_NAME = 'BedrockAnnotationDB';
const DB_VERSION = 2; // Bedrock Change: 版本升级以触发 onupgrade
const WORKSPACE_STORE = 'workspace';
const FILES_STORE = 'files';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 2) {
                    // Bedrock Change: 销毁旧的、基于句柄的存储结构
                    if (db.objectStoreNames.contains(WORKSPACE_STORE)) {
                        db.deleteObjectStore(WORKSPACE_STORE);
                    }
                    if (db.objectStoreNames.contains(FILES_STORE)) {
                        db.deleteObjectStore(FILES_STORE);
                    }
                }

                if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
                    db.createObjectStore(WORKSPACE_STORE);
                }
                if (!db.objectStoreNames.contains(FILES_STORE)) {
                    db.createObjectStore(FILES_STORE, { keyPath: 'baseName' });
                }
            },
        });
    }
    return dbPromise;
};

// ===================================================================
// 辅助函数 (Helper Functions)
// ===================================================================

// Bedrock Note: 此函数保留，但其使用场景受限
const verifyPermission = async (directoryHandle: FileSystemDirectoryHandle, readOnly = false): Promise<boolean> => {
    // This function requires a secure context (HTTPS)
    try {
        const options = { mode: readOnly ? 'read' as const : 'readwrite' as const };
        if ((await directoryHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        if ((await directoryHandle.requestPermission(options)) === 'granted') {
            return true;
        }
    } catch (error) {
        console.warn("Permission check failed, likely due to non-secure context:", error);
    }
    return false;
};

const getBaseName = (fileName: string): string => fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

const getTimestamp = (): string => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = (now.getMonth() + 1).toString().padStart(2, '0');
    const DD = now.getDate().toString().padStart(2, '0');
    const HH = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    return `${YYYY}-${MM}-${DD}_${HH}-${mm}-${ss}`;
};


// ===================================================================
// 文件系统服务 (File System Service)
// ===================================================================

/**
 * @description Bedrock Change: 使用标准File对象初始化一个新的工作区，并存入IndexedDB。
 * @param files 从 <input type="file" webkitdirectory> 获取的文件列表
 * @param onProgress 进度回调函数
 * @returns 包含工作区信息和文件句柄映射的对象。
 */
async function initializeSourceWorkspace(files: File[], onProgress: (progress: { loaded: number; total: number }) => void): Promise<WorkspaceInfo> {

    const fileMap: Map<string, Partial<StoredFiles>> = new Map();
    const totalFiles = files.length;
    let processedFiles = 0;
    onProgress({ loaded: processedFiles, total: totalFiles });

    for (const file of files) {
        const name = file.name;
        const baseName = getBaseName(name);
        if (!fileMap.has(baseName)) {
            fileMap.set(baseName, { baseName });
        }
        const entry = fileMap.get(baseName)!;
        const lowerCaseName = name.toLowerCase();

        if (lowerCaseName.endsWith('.png')) entry.pngFile = file;
        else if (lowerCaseName.endsWith('.txt')) entry.yoloFile = file;
        else if (lowerCaseName.endsWith('.json')) entry.jsonFile = file;

        processedFiles++;
        onProgress({ loaded: processedFiles, total: totalFiles });
    }

    const db = await getDb();
    // 清理旧工作区
    await db.clear(WORKSPACE_STORE);
    await db.clear(FILES_STORE);
    const tx = db.transaction(FILES_STORE, 'readwrite');
    const store = tx.objectStore(FILES_STORE);

    const validEntries = Array.from(fileMap.values()).filter((entry): entry is StoredFiles => !!entry.pngFile);

    for (const entry of validEntries) {
        await store.put(entry);
    }
    await tx.done;

    const imageKeys = validEntries
        .map(e => e.pngFile.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const workspaceInfo: WorkspaceInfo = {
        imageKeys,
        lastFileOperateIndex: 0,
        lastMaskOperateIndex: 0,
    };

    await db.put(WORKSPACE_STORE, workspaceInfo, 'current');
    return workspaceInfo;
}

/**
 * @description Bedrock Change: 将内存中的所有更改与IndexedDB中的源文件合并，并打包成ZIP下载。
 * @param dirtyData 包含所有页面脏数据的对象。
 * @returns 如果保存成功则返回 true，此实现中总是返回 true 因为没有用户取消的步骤。
 */
async function saveWorkspace(dirtyData: {
    yolo: { [key: string]: string },
    json: { [key: string]: string },
    mask: { [key: string]: { apiJson: any } }
}): Promise<boolean> {
    const db = await getDb();
    const workspaceInfo = await db.get(WORKSPACE_STORE, 'current');
    if (!workspaceInfo) throw new Error("无活动工作区。");

    const zip = new JSZip();
    const exportFolderName = `BedrockExport_${getTimestamp()}`;
    const exportFolder = zip.folder(exportFolderName);

    if (!exportFolder) throw new Error("无法创建ZIP文件夹。");

    for (const imageKey of workspaceInfo.imageKeys) {
        const baseName = getBaseName(imageKey);
        const sourceFiles = await db.get(FILES_STORE, baseName);
        if (!sourceFiles) continue;

        // 1. 添加PNG文件
        exportFolder.file(imageKey, sourceFiles.pngFile);

        // 2. 保存FileOperate的YOLO (.txt) 文件
        const yoloContent = dirtyData.yolo[imageKey];
        if (typeof yoloContent === 'string') {
            exportFolder.file(`${baseName}.txt`, yoloContent);
        } else if (sourceFiles.yoloFile) {
            exportFolder.file(`${baseName}.txt`, sourceFiles.yoloFile);
        }

        // 3. 保存JSON (.json) 文件 (合并了FileOperate和MaskOperate的数据)
        const fileOpJsonContent = dirtyData.json[imageKey];
        const maskJsonContent = dirtyData.mask[imageKey]?.apiJson;

        let finalJson: any = {};
        if (sourceFiles.jsonFile) {
            try {
                finalJson = JSON.parse(await sourceFiles.jsonFile.text());
            } catch { /* 忽略解析错误，使用空对象 */ }
        }

        if (typeof fileOpJsonContent === 'string') {
            try {
                const parsedDirtyFileOp = JSON.parse(fileOpJsonContent);
                delete finalJson.cpnts;
                delete finalJson.key_points;
                delete finalJson.segments;
                finalJson = { ...finalJson, ...parsedDirtyFileOp };
            } catch { /* 忽略解析错误 */ }
        }

        if (typeof maskJsonContent === 'object' && maskJsonContent !== null) {
            finalJson = { ...finalJson, ...maskJsonContent };
        }


        if (Object.keys(finalJson).length > 0) {
            exportFolder.file(`${baseName}.json`, JSON.stringify(finalJson, null, 2));
        }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${exportFolderName}.zip`);

    return true;
}

/**
 * @description 尝试从IndexedDB恢复上一个工作区。
 * @returns 如果成功恢复，则返回工作区信息，否则返回 null。
 */
async function restoreWorkspace(): Promise<WorkspaceInfo | null> {
    try {
        const db = await getDb();
        const workspaceInfo = await db.get(WORKSPACE_STORE, 'current');

        if (!workspaceInfo || !workspaceInfo.imageKeys || workspaceInfo.imageKeys.length === 0) {
            await clearWorkspace(); // 清理无效的旧工作区
            return null;
        }

        // 简单验证工作区是否完整
        const firstImageKey = workspaceInfo.imageKeys[0];
        const firstFileBaseName = getBaseName(firstImageKey);
        const fileEntry = await db.get(FILES_STORE, firstFileBaseName);
        if (!fileEntry || !fileEntry.pngFile) {
            console.error("工作区数据不完整，清理并重置。");
            await clearWorkspace();
            return null;
        }

        return workspaceInfo as WorkspaceInfo;
    } catch (error) {
        console.error("恢复工作区失败:", error);
        await clearWorkspace(); // 出错时清理以防万一
        return null;
    }
}

/**
 * @description 根据图片文件名从IndexedDB加载其关联的所有文件内容。
 * @param imageKey 图片的完整文件名 (e.g., 'image_001.png')
 * @returns 包含文件内容的对象
 */
async function loadDataForImage(imageKey: string) {
    const db = await getDb();
    const baseName = getBaseName(imageKey);
    const files = await db.get(FILES_STORE, baseName);

    if (!files) throw new Error(`在IndexedDB中找不到文件: ${imageKey}`);

    const { pngFile, yoloFile, jsonFile } = files;

    return {
        pngFile,
        yoloContent: yoloFile ? await yoloFile.text() : null,
        jsonContent: jsonFile ? await jsonFile.text() : null,
    };
}

/**
 * @description 将最后操作的索引保存到IndexedDB的工作区信息中。
 * @param indices 包含两个页面当前索引的对象
 */
async function saveLastIndices(indices: { fileOperateIndex?: number; maskOperateIndex?: number }) {
    const db = await getDb();
    const workspaceInfo = await db.get(WORKSPACE_STORE, 'current');
    if (workspaceInfo) {
        const updatedInfo: WorkspaceInfo = { ...workspaceInfo, ...indices };
        await db.put(WORKSPACE_STORE, updatedInfo, 'current');
    }
}

/**
 * @description 清除工作区，删除数据库中的所有数据。
 */
async function clearWorkspace() {
    try {
        const db = await getDb();
        await db.clear(WORKSPACE_STORE);
        await db.clear(FILES_STORE);
    } catch (error) {
        console.error("清理工作区时出错:", error);
    }
}


export const workspaceService = {
    initializeSourceWorkspace,
    restoreWorkspace,
    loadDataForImage,
    saveLastIndices,
    clearWorkspace,
    saveWorkspace,
};