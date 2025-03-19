
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

import {Card, Button, Input, Row, Col, Space, Popover, Typography, InputNumber, Layout, message, Select} from 'antd';
import React, { useState, useRef, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css'; // 引入Bootstrap
import {
  createNode, deleteNode, updateNode, findNode,
  getAllNodes,
  createRelationship, deleteRelationship, updateRelationship, findRelationship,
  getAllRelationships
} from '@/pages/GraphOperate/Components/apiFunctions';
// 引入CSS文件lt

// import './Styles/Textarea.css';
// import './Styles/Canvas.css';
// import './Styles/Button.css';
// import './Styles/Other.css';

import './Styles/FileOperate.css';

// 引入常量
import { indexClassColorMap, colorList, jsonNameColorMap } from './Constants/constants';
import { Content } from 'antd/es/layout/layout';
import {useModel} from "@umijs/max";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faUpload} from "@fortawesome/free-solid-svg-icons";

const { Option } = Select;

interface FileOperateProps {
  // 这里可以添加其他可能需要的属性，比如上传后的回调函数等，目前为空
}

// Define the JsonInterface
interface JsonInterface {
  local: {
    buildingBlocks: {
      [key: string]: string[];
    };
    constants: {
      [key: string]: string[];
    };
  };
  global: {
    // Define global properties if needed
  };
}

const translations = {
  zh: {
    uploadFolder: '上传文件夹',
    undo: '撤回',
    save: '保存',
    deleteBox: '删除框',
    restoreDeleted: '恢复删除',
    category: '类别',
    previous: '上一个',
    next: '下一个',
    currentFile: '当前文件',
    function: '功能',
    allowColoring: '正在染色',
    notAllowColoring: '不染色',
    addProperty: '增加属性',
    addNode: '添加节点',
    nodeName: '节点名称',
    key: '键',
    value: '值',
    delete: '删除',
    saveCurrent: '保存当前文件',
    saveAll: '批量保存所有文件',
    chooseJsonName: '选择JsonName',
    chooseJsonType: '选择Json类型',
    noFile: '没有可保存的文件',
    noDeletedBoxes: '没有可恢复的删除框'
  },
  en: {
    uploadFolder: 'Upload Folder',
    undo: 'Undo',
    save: 'Save',
    deleteBox: 'Delete Box',
    restoreDeleted: 'Restore Deleted',
    category: 'Category',
    previous: 'Previous',
    next: 'Next',
    currentFile: 'Current File',
    function: 'Function',
    allowColoring: 'Setting',
    notAllowColoring: 'Not Setting',
    addProperty: 'Add Property',
    addNode: 'Add Node',
    nodeName: 'Node Name',
    key: 'Key',
    value: 'Value',
    delete: 'Delete',
    saveCurrent: 'Save Current',
    saveAll: 'Save All',
    chooseJsonName: 'Choose Json Name',
    chooseJsonType: 'Choose Json Type',
    noFile: 'No files to save',
    noDeletedBoxes: 'No deleted boxes to restore for this picture'
  }
};


const FileOperate: React.FC<FileOperateProps> = ({}) => {

  const { initialState } = useModel('@@initialState');
  const [currentLang, setCurrentLang] = useState(initialState?.language || 'zh');
  const t = translations[currentLang as keyof typeof translations];

  // Update language when global language changes
  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      setCurrentLang(customEvent.detail.language);
    };

    window.addEventListener('languageChange', handleLanguageChange);
    setCurrentLang(initialState?.language || 'zh');

    // message.info(currentLang === 'zh' ? '已切换为中文' : 'Language changed to English');

    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, [initialState?.language]);

  // 定义classIndexMap对象
  const [indexClassColorMapState, setIndexClassColorMapState] = useState(indexClassColorMap);

  // 存储不同类型文件的列表
  const [pngList, setPngList] = useState<File[]>([]);
  const [jpgList, setJpgList] = useState<File[]>([]);
  const [yoloList, setYoloList] = useState<File[]>([]);
  const [jsonList, setJsonList] = useState<File[]>([]);

  // 用于存储当前索引
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // 用于储存用于展示/画框的file/string
  const [currentPng, setCurrentPng] = useState<File | null>(null);
  const [currentJpg, setCurrentJpg] = useState<File | null>(null);
  const [currentJsonContent, setCurrentJsonContent] = useState<string | null>(null);
  const [currentYoloContent, setCurrentYoloContent] = useState<string | null>(null);

  // 创建canvas元素的引用
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 创建textarea元素的引用
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // region 类别序号 类别 类别颜色标识
  const [currentClassIndex, setCurrentClassIndex] = useState<number | null>(0);
  const [currentClassLabel, setCurrentClassLabel] = useState<string | null>(indexClassColorMapState[currentClassIndex]?.label || '');
  const [currentClassColor, setCurrentClassColor] = useState<string | null>(indexClassColorMapState[currentClassIndex]?.color || '');

  const [currentClassIndexToShow, setCurrentClassIndexToShow] = useState<number | null>(0);
  const [currentClassLabelToShow, setCurrentClassLabelToShow] = useState<string | null>(indexClassColorMapState[currentClassIndexToShow]?.label || '');
  const [currentClassColorToShow, setCurrentClassColorToShow] = useState<string | null>(indexClassColorMapState[currentClassIndexToShow]?.color || '');

  // 选择类别
  const selectCurrentClassByIndex = (classIndex: number) => {
    const selectedClass = indexClassColorMapState[classIndex];
    if (selectedClass) {
      setCurrentClassLabel(selectedClass.label);
      setCurrentClassIndex(classIndex);
      setCurrentClassColor(selectedClass.color);
    }
  };
  // endregion

  // region Tag类别 选择 颜色标识
  const [currentYoloContentWithRectName, setCurrentYoloContentWithRectName] = useState<string | null>(null);

  //endregion

  // region 右侧操作相关
  const [nodeName, setNodeName] = useState<string>('');
  const [nodePropertiesKeys, setNodePropertiesKeys] = useState<string[]>([]);
  const [nodePropertiesValues, setNodePropertiesValues] = useState<string[]>([]);

  const handleAddNodeProperty = () => {
    setNodePropertiesKeys([...nodePropertiesKeys, '']);
    setNodePropertiesValues([...nodePropertiesValues, '']);
  };

  const handleUpdateNodeProperty = (index: number, field: 'key' | 'value', value: string) => {
    const newKeys = [...nodePropertiesKeys];
    const newValues = [...nodePropertiesValues];
    if (field === 'key') {
      newKeys[index] = value;
    } else {
      newValues[index] = value;
    }
    setNodePropertiesKeys(newKeys);
    setNodePropertiesValues(newValues);
  };

  const handleCreateNode = async () => {
    const propertiesObj = {};
    nodePropertiesKeys.forEach((key, index) => {
      propertiesObj[key] = nodePropertiesValues[index];
    });

    // 将当前 canvas 内容转换为 Base64 编码
    const canvas = canvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL('image/png'); // 确保生成的是 PNG 格式的 Base64 编码
      propertiesObj['annotatedImage'] = dataURL; // 将 Base64 编码的图片保存到 properties 中
      propertiesObj['ImgName'] = pngList[currentIndex].name;
    }

    const newNode = { name: nodeName, properties: propertiesObj };

    try {
      // 尝试创建节点并检查结果
      const result = await createNode(newNode);
      if (result.code !== 0) {
        // 如果结果代码不是0，打印错误信息并退出函数
        console.error(`Failed to create node with error code: ${result.code}`);
        return;
      }

      // 节点创建成功，执行后续逻辑
      for (const [key, value] of Object.entries(propertiesObj)) {
        const nodeName = `${key}_${value}`;
        try {
          const relatedNode = await findNode({ name: nodeName });
          if (!relatedNode) {
            // 如果没有找到同名节点，创建新节点
            let newRelatedNode = { name: nodeName, properties: { [key]: value } };
            await createNode(newRelatedNode);
            console.log(`Created new node ${newRelatedNode.name} because no existing node shared the ${key} value of ${value}`);

            // 创建新节点与原始节点的关系
            await createRelationship({
              name: key, // 关系名称是属性名
              properties: {
                fromNode: newNode.name,
                toNode: newRelatedNode.name
              }
            });
            console.log(`Connected ${newNode.name} to ${newRelatedNode.name} as no node shared the ${key} value of ${value}`);
          } else {
            // 如果找到具有相同属性值的节点，创建关系
            await createRelationship({
              name: key, // 关系名称是属性名
              properties: {
                fromNode: newNode.name,
                toNode: relatedNode.name
              }
            });
            console.log(`Connected ${newNode.name} to ${relatedNode.name} via property ${key}`);
          }
        } catch (error) {
          console.error(`Error handling property ${key}: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Failed to create initial node: ${error}`);
    }
  };

  const removeNodeProperty = (index: number) => {
    const newKeys = [...nodePropertiesKeys];
    const newValues = [...nodePropertiesValues];
    newKeys.splice(index, 1);
    newValues.splice(index, 1);
    setNodePropertiesKeys(newKeys);
    setNodePropertiesValues(newValues);
  };
  // endregion

  // region 文件操作相关
  /*
    创建函数用于解析和转换yolo内容成绝对位置的格式
    {classIndex x y w h} => {color leftTopX leftTopY rightBottomX rightBottomY}
  */
  const parseYoloContent = (relativeContent: string | null) => {
    const absoluteArray: string[] = [];
    if (relativeContent) {
      const relativeLines = relativeContent.split('\n').filter(line => line.trim() !== ''); // 过滤掉空行
      relativeLines.forEach((relativeLine) => {
        const relativeValues = relativeLine.split(' ');
        const relativeClassIndex = parseInt(relativeValues[0]);
        const relativeX = parseFloat(relativeValues[1]);
        const relativeY = parseFloat(relativeValues[2]);
        const relativeW = parseFloat(relativeValues[3]);
        const relativeH = parseFloat(relativeValues[4]);

        const absoluteLeftTopX = ((relativeX - relativeW / 2) * canvasRef.current!.width);
        const absoluteLeftTopY = ((relativeY - relativeH / 2) * canvasRef.current!.height);
        const absoluteRightBottomX = ((relativeX + relativeW / 2) * canvasRef.current!.width);
        const absoluteRightBottomY = ((relativeY + relativeH / 2) * canvasRef.current!.height);
        const absoluteColor = indexClassColorMapState[relativeClassIndex]?.color;
        if (absoluteColor) {
          absoluteArray.push(`${absoluteColor} ${absoluteLeftTopX} ${absoluteLeftTopY} ${absoluteRightBottomX} ${absoluteRightBottomY}`);
        }
      });
    }
    return absoluteArray;
  };

  /*
    创建函数用于反向将绝对位置解析成相对位置的格式
    {color leftTopX leftTopY rightBottomX rightBottomY} => {classIndex x y w h}
  */
  const reverseParseYoloContent = (absoluteContent: string | null) => {
    const relativeArray: string[] = [];
    if (absoluteContent) {
      const absoluteLines = absoluteContent.split('\n');
      absoluteLines.forEach((absoluteLines) => {
        const absoluteColor = absoluteLines.split(' ')[0];
        const absoluteLeftTopX = parseFloat(absoluteLines.split(' ')[1]);
        const absoluteLeftTopY = parseFloat(absoluteLines.split(' ')[2]);
        const absoluteRightBottomX = parseFloat(absoluteLines.split(' ')[3]);
        const absoluteRightBottomY = parseFloat(absoluteLines.split(' ')[4]);

        const relativeX = ((absoluteLeftTopX + absoluteRightBottomX) / 2 / canvasRef.current!.width);
        const relativeY = ((absoluteLeftTopY + absoluteRightBottomY) / 2 / canvasRef.current!.height);
        const relativeW = ((absoluteRightBottomX - absoluteLeftTopX) / canvasRef.current!.width);
        const relativeH = ((absoluteRightBottomY - absoluteLeftTopY) / canvasRef.current!.height);

        const relativeClassIndex = Object.keys(indexClassColorMapState).find(key => indexClassColorMapState[key].color === absoluteColor) || '';

        relativeArray.push(`${relativeClassIndex} ${relativeX} ${relativeY} ${relativeW} ${relativeH}`);

      });
    }
    return relativeArray;
  }
  // endregion

  // region 撤回画框&&删除框 && 撤销删除框
  // 处理撤回操作
  const [deletedBoxHistories, setDeletedBoxHistories] = useState<{ index: number; content: string }[]>([]);

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (ctx) {
      // 清除整个canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (currentPng) {
      const img = new Image();
      img.src = URL.createObjectURL(currentPng);

      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas && ctx) {
          // 将图片绘制到canvas上
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          if (ctx && currentYoloContent) {
            // 先解析currentYoloContent获取绘制信息
            const yoloContentToDrawUndo = parseYoloContent(currentYoloContent).slice(0, -1);

            // 遍历解析后的内容，逐个绘制框
            yoloContentToDrawUndo.forEach((item) => {
              const [colorUndo, leftTopXUndo, leftTopYUndo, rightBottomXUndo, rightBottomYUndo] = item.split(' ');

              ctx.beginPath();
              ctx.strokeStyle = colorUndo;
              ctx.rect(
                parseFloat(leftTopXUndo),
                parseFloat(leftTopYUndo),
                parseFloat(rightBottomXUndo) - parseFloat(leftTopXUndo),
                parseFloat(rightBottomYUndo) - parseFloat(leftTopYUndo)
              );
              ctx.stroke(); // 绘制框
            });
          }
          // @ts-ignore
          setCurrentYoloContent(currentYoloContent?.split('\n').slice(0, -1).join('\n')) // 将currentYoloContent的最后一行删除
          // console.log('currentYoloContent' + currentYoloContent);
          // 因为操作到这里的时候set操作很少，所以几乎可以认为是实时的，不用放到useeffect中
        }
      };
      // 处理图片加载失败的情况
      img.onerror = () => {
        console.error('图片加载失败，无法完成撤销操作');
      };
    } else {
      console.error('当前没有可用于撤销操作的PNG图片');
    }
  };

  /*判断MouseDown坐标点是否在矩形框内*/
  const isPointInRectangle = (x: number, y: number, rect: { left: number, top: number, right: number, bottom: number }) => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const handleDeleteBox = () => {
    const canvas = canvasRef.current;
    if (canvas && currentYoloContent) {
      const rects = parseYoloContent(currentYoloContent).map((line) => {
        const [color, leftTopX, leftTopY, rightBottomX, rightBottomY] = line.split(' ');
        return {
          left: parseFloat(leftTopX),
          top: parseFloat(leftTopY),
          right: parseFloat(rightBottomX),
          bottom: parseFloat(rightBottomY)
        };
      });
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const mouseX = mouseDownCoords.x;
        const mouseY = mouseDownCoords.y;
        const rectToDeleteIndex = rects.findIndex((rect) => isPointInRectangle(mouseX, mouseY, rect));
        if (rectToDeleteIndex !== -1) {
          const lines = currentYoloContent.split('\n');
          const deletedBox = {
            index: rectToDeleteIndex,
            content: lines[rectToDeleteIndex]
          };
          const currentPictureIndex = currentIndex;
          // 将删除框信息添加到以currentIndex为键的Map中对应的数组里
          setDeletedBoxHistories(prev => {
            const newDeletedBoxHistories = new Map(prev);
            const currentDeletedBoxHistory = newDeletedBoxHistories.get(currentPictureIndex) || [];
            newDeletedBoxHistories.set(currentPictureIndex, [
              ...currentDeletedBoxHistory,
              deletedBox
            ]);
            return newDeletedBoxHistories;
          });
          const currentYoloContentDeleted = lines.filter((_, index) => index !== rectToDeleteIndex).join('\n');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const img = new Image();
          img.src = URL.createObjectURL(currentPng!);
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (currentYoloContentDeleted) {
              const yoloContentToDraw = parseYoloContent(currentYoloContentDeleted);
              yoloContentToDraw.forEach((item) => {
                const [color, leftTopX, leftTopY, rightBottomX, rightBottomY] = item.split(' ');
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.rect(
                  parseFloat(leftTopX),
                  parseFloat(leftTopY),
                  parseFloat(rightBottomX) - parseFloat(leftTopX),
                  parseFloat(rightBottomY) - parseFloat(leftTopY)
                );
                ctx.stroke();
              });
            }
            setCurrentYoloContent(currentYoloContentDeleted);
          };
          img.onerror = () => {
            console.error('图片加载失败，无法完成删除框操作');
          };
        }
      }
    }
  };

  /*
  *   撤销删除框
  */
  const handleDeleteBoxUndo = () => {
    const currentPictureIndex = currentIndex;
    const deletedBoxHistoriesMap = deletedBoxHistories;
    const currentDeletedBoxHistory = deletedBoxHistoriesMap.get(currentPictureIndex) || [];
    if (currentDeletedBoxHistory.length === 0) {
      console.log('No deleted boxes to restore for this picture');
      message.warning('No deleted boxes to restore for this picture');
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx && currentPng) {
      const lastDeletedBox = currentDeletedBoxHistory[currentDeletedBoxHistory.length - 1];
      const lastDeletedIndex = lastDeletedBox.index;

      const lines = currentYoloContent.split('\n');
      lines.splice(lastDeletedIndex, 0, lastDeletedBox.content);
      const newYoloContent = lines.join('\n');

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      img.src = URL.createObjectURL(currentPng);

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const yoloContentToDraw = parseYoloContent(newYoloContent);
        yoloContentToDraw.forEach((item) => {
          const [color, leftTopX, leftTopY, rightBottomX, rightBottomY] = item.split(' ');
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.rect(
            parseFloat(leftTopX),
            parseFloat(leftTopY),
            parseFloat(rightBottomX) - parseFloat(leftTopX),
            parseFloat(rightBottomY) - parseFloat(leftTopY)
          );
          ctx.stroke();
        });

        setCurrentYoloContent(newYoloContent);
        // 更新以currentIndex为键的Map中对应的数组，移除已恢复的框
        setDeletedBoxHistories(prev => {
          const newDeletedBoxHistories = new Map(prev);
          const updatedCurrentDeletedBoxHistory = currentDeletedBoxHistory.slice(0, -1);
          newDeletedBoxHistories.set(currentPictureIndex, updatedCurrentDeletedBoxHistory);
          return newDeletedBoxHistories;
        });
      };

      img.onerror = () => {
        console.error('图片加载失败，无法完成恢复删除框操作');
      };
    }
  };
  // endregion

  // region 处理文件夹上传
  // 定义一个函数用于比较文件名中的数字部分，并按数字大小排序
  const compareFileNamesByNumber = (a: File, b: File) => {
    const aNameNumber = parseInt(a.name.match(/\d+/)?.[0] || '0');
    const bNameNumber = parseInt(b.name.match(/\d+/)?.[0] || '0');
    return aNameNumber - bNameNumber;
  };

  // 定义一个函数用于解析class文件内容并更新indexClassColorMapState
  const parseClassFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      if (e.target) {
        const content = e.target.result as string;
        const lines = content.split('\n');
        lines.forEach((line) => {
          const [indexStr, className] = line.split(':');
          const index = parseInt(indexStr.trim());
          if (!isNaN(index) && indexClassColorMapState[index]) {
            // 更新indexClassColorMapState中相应索引的label（如果需要更新颜色等其他信息，在这里添加相应逻辑）
            setIndexClassColorMapState(prevMap => ({
              ...prevMap,
              [index]: {
                ...prevMap[index],
                label: className.trim()
              }
            }));
          }
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const uploadedFiles = Array.from(files);

      // 用于存储符合条件的png、jpg、yolo、json,tag 文件
      const newPngList: File[] = [];
      const newJpgList: File[] = [];
      const newYoloList: File[] = [];
      const newJsonList: File[] = [];


      uploadedFiles.forEach((file) => {
        if (/class/i.test(file.name)) {
          // 如果文件名包含class，处理该文件内容并更新indexClassColorMapState
          parseClassFile(file);
        } else {
          if (file.type.includes('image/png')) {
            newPngList.push(file);
          } else if (file.type.includes('image/jpeg')) {
            newJpgList.push(file);
          } else if (file.name.endsWith('.txt')) {
            newYoloList.push(file);
          } else if (file.name.endsWith('.json')) {
            newJsonList.push(file);
          }
        }
      });

      // 对文件列表进行排序
      newPngList.sort(compareFileNamesByNumber);
      newJpgList.sort(compareFileNamesByNumber);
      newYoloList.sort(compareFileNamesByNumber);
      newJsonList.sort(compareFileNamesByNumber);

      // 更新状态
      setPngList(prevPngList => {
        const updatedList = newPngList;
        console.log('pngList updated:', updatedList);
        return updatedList;
      });
      setJpgList(prevJpgList => {
        const updatedList = newJpgList;
        console.log('jpgList updated:', updatedList);
        return updatedList;
      });
      setYoloList(prevYoloList => {
        const updatedList = newYoloList;
        console.log('yoloList updated:', updatedList);
        return updatedList;
      });
      setJsonList(prevJsonList => {
        const updatedList = newJsonList;
        console.log('jsonList updated:', updatedList);
        return updatedList;
      });

      // 上传新文件后，重置当前显示的png文件索引为0
      setCurrentIndex(0);
      console.log('currentIndex reset to:', 0);
    }
  };
  // endregion

  // region 保存和加载文件内容
  // 将currentYoloContent内容保存到本地
  const handleSaveCurrentYoloAndJsonToLocal = () => {
    if (currentYoloContent) {
      // Step 1: Save currentYoloContent as a .txt file
      const yoloContentToSave = currentYoloContent
        .replace(/,/g, '') // Remove commas
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          return line.split(' ').map(token => {
            const num = parseFloat(token);
            if (isNaN(num)) {
              return token; // If not a number, keep it as is
            } else if (Number.isInteger(num)) {
              return num.toString(); // If an integer, keep it as is
            } else {
              return num.toFixed(2); // If a float, keep two decimal places
            }
          }).join(' ');
        });

      const yoloBlob = new Blob([yoloContentToSave.join('\n')], { type: 'text/plain' });
      const yoloUrl = URL.createObjectURL(yoloBlob);
      const yoloLink = document.createElement('a');
      yoloLink.href = yoloUrl;
      yoloLink.download = `${currentIndex+1}.txt`;
      yoloLink.click();

      // Step 2: Merge node information from globalList into currentJsonContent
      const globalContent = globalList[currentIndex];
      if (globalContent) {
        const jsonObj = parseJsonContent(currentJsonContent);
        jsonObj.global = {
          nodeName: globalContent.nodeName,
          nodePropertiesKeys: globalContent.nodePropertiesKeys,
          nodePropertiesValues: globalContent.nodePropertiesValues
        };
        const updatedJsonContent = stringifyJsonContent(jsonObj);

        // Step 3: Save the updated currentJsonContent as a .json file
        const jsonBlob = new Blob([updatedJsonContent], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const jsonLink = document.createElement('a');
        jsonLink.href = jsonUrl;
        jsonLink.download = `${currentIndex+1}.json`;
        jsonLink.click();
      }
    }
  };

  const handleSaveYoloAndJsonListToLocal = async () => {
    if (yoloList.length === 0) {
      message.warning(t.noFile);
      return;
    }

    // 读取所有yoloList的文件内容
    const yoloContentsArray = await readFiles(yoloList);
    // 读取所有jsonList的文件内容
    const jsonContentsArray = await readFiles(jsonList);

    const zip = new JSZip();
    yoloList.forEach((file, index) => {
      const yoloContent = yoloContentsArray[index];
      const jsonContent = jsonContentsArray[index];

      const jsonObj: any = {
        local: {
          buildingBlocks: {},
          constants: {},
        },
        global: {
          Name: '',
          properties: {},
        },
      };

      // 解析jsonContent
      if (jsonContent) {
        const parsedJson = parseJsonContent(jsonContent);
        jsonObj.local.buildingBlocks = parsedJson.local.buildingBlocks;
        jsonObj.local.constants = parsedJson.local.constants;
      }

      // 填充global部分
      const globalContent = globalList[index];
      if (globalContent) {
        jsonObj.global.Name = globalContent.nodeName;
        jsonObj.global.properties = globalContent.nodePropertiesKeys.reduce((acc, key, idx) => {
          acc[key] = globalContent.nodePropertiesValues[idx];
          return acc;
        }, {});
      }

      // 生成JSON字符串
      const jsonStr = JSON.stringify(jsonObj, null, 2);
      zip.file(`${index+1}.json`, jsonStr);
      zip.file(getFileNameWithSuffix(file.name, '.txt'), yoloContent);
    });

    zip.generateAsync({ type: 'blob' }).then((content) => {
      saveAs(content, 'yoloList.zip');
    }).catch((error) => {
      console.error('文件读取失败', error);
    });
  };

// 辅助函数：读取文件内容
  const readFiles = (files: File[]) => {
    return Promise.all(files.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }));
  };

// 辅助函数：确保文件名带有指定的后缀
  function getFileNameWithSuffix(name: string, suffix: string) {
    if (!name.endsWith(suffix)) {
      return `${name}${suffix}`;
    }
    return name;
  }

  // 抽象出保存currentYoloContent为文件并更新yoloList的函数
  const saveYoloContentAsFile = (index: number) => {
    const yoloContent = currentYoloContent;
    if (yoloContent) {
      const blob = new Blob([yoloContent], { type: 'text/plain' });
      const file = new File([blob], `${index+1}`, { type: 'text/plain' });
      setYoloList(prevList => {
        const updatedList = [...prevList];
        updatedList[index] = file;
        return updatedList;
      });
    }
  };
  // 抽象出保存currentTagsAsFile的函数
  const saveJsonContentAsFile = (index: number) => {
    // message.warning('保存当前标签');
    const jsonContent = currentJsonContent;
    // message.info('保存当前标签到jsonList');
    if (jsonContent) {
      const blob = new Blob([jsonContent], { type: 'text/plain' });
      const file = new File([blob], `${index+1}`, { type: 'text/plain' });
      setJsonList(prevList => {
        const updatedList = [...prevList];
        updatedList[index] = file;
        return updatedList;
      });
    }
  };

  // 切换到下一个png文件及对应的txt文件内容
  const handleNextIndex = () => {
    if (currentIndex < pngList.length - 1) {
      saveYoloContentAsFile(currentIndex);
      saveJsonContentAsFile(currentIndex);

      // 保存当前节点属性到 globalList
      setGlobalList(prev => ({
        ...prev,
        [currentIndex]: {
          nodeName,
          nodePropertiesKeys,
          nodePropertiesValues
        }
      }));

      setCurrentIndex(prevIndex => prevIndex + 1);
    }
    setIsAllowClickToFillRect(false); // 每次切换默认不能点击绘制框
  };

  const handlePrevIndex = () => {
    if (currentIndex > 0) {
      saveYoloContentAsFile(currentIndex);
      saveJsonContentAsFile(currentIndex);

      // 保存当前节点属性到 globalList
      setGlobalList(prev => ({
        ...prev,
        [currentIndex]: {
          nodeName,
          nodePropertiesKeys,
          nodePropertiesValues
        }
      }));

      setCurrentIndex(prevIndex => prevIndex - 1);
    }
    setIsAllowClickToFillRect(false); // 每次切换默认不能点击绘制框
  };
  // endregion

  // region 初始化和更新当前文件内容

  // 监听pngList更新的useEffect
  useEffect(() => {
    if (pngList.length > 0) {
      setCurrentPng(pngList[currentIndex]);
    } else {
      setCurrentPng(null);
    }
  }, [pngList, currentIndex]);

  // 单独监听currentPng更新的useEffect
  useEffect(() => {
    if (currentPng) {
      // console.log('currentPng has been updated successfully.' + currentPng.name);
      // 调用加载函数将更新后的currentPng加载到canvas上
      loadCurrentPngToCanvas(currentPng);
    }
  }, [currentPng]);

  // 监听jpgList更新的useEffect
  useEffect(() => {
    if (jpgList.length > 0) {
      setCurrentJpg(jpgList[currentIndex]);
    } else {
      setCurrentJpg(null);
    }
  }, [jpgList, currentIndex]);

  // 监听currentJpg更新的useEffect
  useEffect(() => {}, [currentJpg]);

  // 监听yoloList更新的useEffect
  useEffect(() => {
    // 用filerender将yoloList中的内容读取到currentYoloContent中
    if (yoloList.length > 0 && currentIndex >= 0 && currentIndex < yoloList.length) {
      const reader = new FileReader();
      reader.onload = function (e) {
        if (e.target) {
          let content = e.target.result as string;
          // 对读取到的内容直接进行去除空行的处理
          const lines = content.split('\n');
          const nonEmptyLines = lines.filter(line => line.trim() !== '');
          const contentWithoutEmptyLines = nonEmptyLines.join('\n');
          // 将处理后的内容设置给currentYoloContent
          setCurrentYoloContent(contentWithoutEmptyLines);
        }
      };
      reader.readAsText(yoloList[currentIndex]);
    }
  }, [yoloList, currentIndex]);

  // 监听yoloList更新的useEffect
  useEffect(() => {
    console.log('yoloList has been updated successfully.');
  }, [yoloList]);

  // 单独监听currentYoloContent更新的useEffect
  useEffect(() => {
    // console.log('currentYoloContent has been updated successfully.');
    // console.log('currentYoloContent:'+ currentYoloContent);

    // 由于 loadCurrentPngToCanvas中filerender 开始读取并不会等到读取完成再执行后续代码
    // 所以这里需要延迟10毫秒执行loadCurrentYoloContentToCanvas函数(这是一个比较简单的实现)
    if (isNeedAutoParseYoloToCanvas){
      // loadCurrentYoloContentToCanvas(currentYoloContent);
      setTimeout(() => {
        loadCurrentYoloContentToCanvas(currentYoloContent);
      }, 10)
      // console.log('isNeedAutoParseYoloToCanvas is true.');
    }else{
      // console.log('isNeedAutoParseYoloToCanvas is false.');
    }
    // setCurrentYoloContentWithRectName(addRectNameToYoloContent(currentYoloContent));// 没必要放着，
  }, [currentYoloContent]);

  // 监听jsonList更新的useEffect
  useEffect(() => {
    // 用filerender将jsonList中的内容读取到currentTag中
    if (jsonList.length > 0 && currentIndex >= 0 && currentIndex < jsonList.length) {
      const reader = new FileReader();
      reader.onload = function (e) {
        if (e.target) {
          setCurrentJsonContent(e.target.result as string);
        }
      };
      reader.readAsText(jsonList[currentIndex]);
    }
  }, [jsonList, currentIndex]);

  // 单独监听jsonList
  useEffect(() => {
    console.log('jsonList has been updated successfully.');
  }, [jsonList]);

  // 监听currentjsonContent更新的useEffect
  useEffect(() => {
    console.log('currentJsonContent has been updated successfully.' + currentJsonContent);
    if (isNeedAutoParseJsonToCanvas){
      // loadCurrentJsonContentToCanvas(currentJsonContent);
      setTimeout(() => {
        // message.info('isNeedAutoParseJsonToCanvas is true.' + 'ready to load currentJsonContent to canvas');
        loadCurrentJsonContentToCanvas(currentJsonContent);
      }, 10)
    }else {
      // message.info('isNeedAutoParseJsonToCanvas is false.');
    }
    setIsNeedAutoParseJsonToCanvas(true);

    if (currentJsonContent) {
      const parsedContent = parseJsonContent(currentJsonContent);
      setParsedJsonContent(parsedContent);
    }

  }, [currentJsonContent]);

  useEffect(() => {
    // console.log('CurrentYoloContentWithClassNumbers has been updated successfully.' + currentYoloContentWithRectName);
  }, [currentYoloContentWithRectName]);

  // endregion

  // region 绘制和加载图片到canvas
  /*
  用于处理png文件到canvas的绘制
  */
  const loadCurrentPngToCanvas = (pngFile: File | null) => {
    if (pngFile) {
      const img = new Image();

      // 当图片加载完成时触发的回调函数
      img.onload = function () {
        // 获取当前的canvas元素引用
        const canvas = canvasRef.current;
        if (canvas) {
          // 获取canvas的2D上下文，用于绘制操作
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // 设置canvas的宽度为图片的宽度
            canvas.width = img.width;
            // 设置canvas的高度为图片的高度
            canvas.height = img.height;
            // 将加载完成的图片绘制到canvas上，从坐标(0, 0)开始绘制
            ctx.drawImage(img, 0, 0);
            // 输出日志表示图片已成功加载并绘制到canvas上
            // console.log('Image has been loaded and drawn on canvas successfully.');
          }
        }
      };

      // 当图片加载失败时触发的回调函数
      img.onerror = function () {
        // 输出错误日志，表示图片加载失败
        console.error('Error loading the image.');
      };

      // 创建一个FileReader对象，用于读取文件内容
      const reader = new FileReader();

      // 当文件读取成功时触发的回调函数
      reader.onload = function (e) {
        // 将读取到的DataURL设置为图片的src，触发图片加载
        img.src = e.target?.result as string;
        // 输出日志表示文件已成功读取为DataURL
        // console.log('File has been read successfully as DataURL.');
      };

      // 当文件读取失败时触发的回调函数
      reader.onerror = function () {
        // 输出错误日志，表示文件读取失败
        console.error('Error reading the file.');
      };

      // 开始读取文件，将文件内容转换为DataURL格式
      reader.readAsDataURL(pngFile);
      // 输出日志表示开始加载PNG文件
      console.log('Started loading the PNG file.');
    }
  };

  // 创建函数 用parseYoloContent解析currentYoloContent并按照规则在canvas上绘制框
  const loadCurrentYoloContentToCanvas = (yoloContentInput: string | null) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    // console.log('currentYoloContent:'+ currentYoloContent);
    // console.log('ctx:'+ ctx);
    // console.log('loadCurrentYoloContentToCanvas:');

    if (ctx && yoloContentInput) {
      // console.log('Ready to draw boxes on canvas');
      // 先解析currentYoloContent获取绘制信息
      const yoloContentToDraw = parseYoloContent(yoloContentInput);
      // 遍历解析后的内容，逐个绘制框
      yoloContentToDraw.forEach((item) => {
        const [color, leftTopX, leftTopY, rightBottomX, rightBottomY] = item.split(' ');

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // 线宽
        ctx.rect(
          parseFloat(leftTopX),
          parseFloat(leftTopY),
          parseFloat(rightBottomX) - parseFloat(leftTopX),
          parseFloat(rightBottomY) - parseFloat(leftTopY)
        );
        ctx.stroke(); // 绘制框
        // console.log('Box drawn successfully');
      });
      // console.log('Box drawn successfully');
    }
  };

  // 创建函数 用curentjsonContent在canvas上绘制框 无需解析
  const loadCurrentJsonContentToCanvas = (jsonContentInput: string | null) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (ctx && jsonContentInput) {
      // 解析 currentJsonContent
      const jsonLines = jsonContentInput.split('\n');
      jsonLines.forEach((line) => {
        const [jsonTypeKey, jsonName, boxNames] = line.split(':');
        const color = jsonNameColorMap[jsonName];
        console.log('jsonName:'+ jsonName + ',color:'+ color + ',boxNames:'+ boxNames);

        if (color && boxNames) {
          const boxes = boxNames.split(' ');
          boxes.forEach((boxName) => {
            // 从 currentYoloContentWithRectName 中提取框的坐标信息
            const yoloLines = addRectNameToYoloContent(currentYoloContent)?.split('\n');
            /*
            * 这里不能用 currentYoloContentWithRectName 因为currentYoloContent切换更新之后直接就调用load函数了，来不及setCurrentYoloContentWithRectName*/
            console.log(addRectNameToYoloContent(currentYoloContent))

            if (yoloLines) {
              // console.log('yoloLines:' + yoloLines);
              const boxLine = yoloLines.find((yoloLine) => yoloLine.startsWith(boxName));
              if (boxLine) {
                // message.info('22222222222');
                const [_, classIndex, x, y, w, h] = boxLine.split(' ');
                const boxX = parseFloat(x);
                const boxY = parseFloat(y);
                const boxW = parseFloat(w);
                const boxH = parseFloat(h);

                // message.info('染色');

                // 在 canvas 上绘制框并染色
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.2;
                ctx.fillRect(
                    (boxX - boxW / 2) * canvas.width,
                    (boxY - boxH / 2) * canvas.height,
                    boxW * canvas.width,
                    boxH * canvas.height
                );
                ctx.globalAlpha = 1;
              }
            }
          });
        }
      });
    }
  };

  // endregion

  // region 在textarea中显示带有类别标号的 类别标号就是每个框的名字
  const addRectNameToYoloContent = (content: string | null) => {
    if (content) {
      const lines = content.split('\n').filter(line => line.trim() !== '');
      const classCounterMap = new Map<string, number>(); // 用于存储每个类别的序号

      const numberedLines = lines.map((line) => {
        const parts = line.split(' ');
        const classIndex = parts[0];
        const x = parseFloat(parts[1]).toFixed(4);
        const y = parseFloat(parts[2]).toFixed(4);
        const w = parseFloat(parts[3]).toFixed(4);
        const h = parseFloat(parts[4]).toFixed(4);

        // 获取或设置类别序号
        if (!classCounterMap.has(classIndex)) {
          classCounterMap.set(classIndex, 0);
        } else {
          classCounterMap.set(classIndex, classCounterMap.get(classIndex)! + 1);
        }
        const classCounter = classCounterMap.get(classIndex)!;
        // 从 indexClassColorMapState 中获取类别标签
        const classLabel = indexClassColorMapState[classIndex]?.label || `class${classIndex}`;
        return `${classLabel}_${classCounter} ${classIndex} ${x} ${y} ${w} ${h}`;
      });
      return numberedLines.join('\n');
    } else {
      return ' ';
    }
  };
  // endregion

  // region 鼠标在canvas画布上绘制临时框的相关函数
  // 存储鼠标按下时的坐标以及上一次鼠标移动时的坐标，用于计算框的大小和位置
  const [mouseDownCoords, setMouseDownCoords] = useState({ x: 0, y: 0 });
  const [prevMouseMoveCoords, setPrevMouseMoveCoords] = useState({ x: 0, y: 0 });

  const [canvasImageData, setCanvasImageData] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isNeedAutoParseYoloToCanvas, setIsNeedAutoParseYoloToCanvas] = useState(true);
  const [isNeedAutoParseJsonToCanvas, setIsNeedAutoParseJsonToCanvas] = useState(true);

  // 存储绘制框的临时数据，包含相对位置信息及对应的classIndex
  const [tempBoxData, setTempBoxData] = useState({
    relativeClassIndexTemp: currentClassIndex,
    relativeXTemp: 0,
    relativeYTemp: 0,
    relativeWTemp: 0,
    relativeHTemp: 0,
  });
// 鼠标按下事件处理函数
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setMouseDownCoords({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // 保存当前canvas的图像
        setCanvasImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      }
    }
  };

  // 引入 throttle限制handlemousemove的触发频率 减少性能损失
  const throttle = (func: { (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void; apply?: any; }, limit: number | undefined) => {
    let inThrottle: boolean;
    return function(...args: any) {
      if (!inThrottle) {
        // @ts-ignore
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  };

  // 鼠标移动事件处理函数
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      // 遍历currentYoloContent 如果当前鼠标位置在框内 则将 currentClassLabelToShow 设置为框的numberClassMap[classIndex]
      // 否则将 currentClassLabelToShow 设置为 null
      // 遍历currentYoloContent
      const yoloContentLines = currentYoloContent?.split('\n');
      if (yoloContentLines) {
        yoloContentLines.forEach((line, index) => {
          const [classIndex, x, y, w, h] = line.split(' ');
          const boxX = parseFloat(x);
          const boxY = parseFloat(y);
          const boxW = parseFloat(w);
          const boxH = parseFloat(h);
          // console.log('(boxX - boxW / 2) * canvas.width:' + (boxX - boxW / 2) * canvas.width);
          // console.log('(boxY - boxH / 2) * canvas.height:' + (boxY - boxH / 2) * canvas.height);
          // console.log('currentX:' + currentX + 'currentY:' + currentY);
          if (
            currentX >= (boxX - boxW / 2) * canvas.width && currentX <= (boxX + boxW / 2) * canvas.width &&
            currentY >= (boxY - boxH / 2) * canvas.height && currentY <= (boxY + boxH / 2) * canvas.height
          ) {
            setCurrentClassLabelToShow(indexClassColorMapState[classIndex].label);
            setCurrentClassColorToShow(indexClassColorMapState[classIndex].color);
            // console.log('currentClassLabelToShow:' + currentClassLabelToShow);
            // console.log('currentClassColorToShow:' + currentClassColorToShow);

          }
        });
      }
      if (isDrawing) {

        setTempBoxData({
          relativeClassIndexTemp: currentClassIndex,
          relativeXTemp: Math.min(mouseDownCoords.x, currentX),
          relativeYTemp: Math.min(mouseDownCoords.y, currentY),
          relativeWTemp: Math.abs(currentX - mouseDownCoords.x),
          relativeHTemp: Math.abs(currentY - mouseDownCoords.y),
        });

        const ctx = canvas.getContext('2d');
        if (ctx && canvasImageData) {
          // 恢复保存的图像
          ctx.putImageData(canvasImageData, 0, 0);
          // 绘制新的临时框
          ctx.beginPath();
          ctx.rect(
            tempBoxData.relativeXTemp,
            tempBoxData.relativeYTemp,
            tempBoxData.relativeWTemp,
            tempBoxData.relativeHTemp
          );
          ctx.strokeStyle = currentClassColor || 'black';
          ctx.stroke();
        }
      }
    }
  };
  const throttledHandleMouseMove = throttle(handleMouseMove, 100);


// 鼠标松开事件处理函数
  const handleMouseUp = () => {
    const canvas = canvasRef.current;

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx && isDrawing) {
        // 绘制最终的框  因为handleMouseMove中已经绘制过最近的框，因此这里无需再绘制

        // 计算 YOLO 格式数据并保存
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const x_center = (tempBoxData.relativeXTemp + tempBoxData.relativeWTemp / 2) / canvasWidth;
        const y_center = (tempBoxData.relativeYTemp + tempBoxData.relativeHTemp / 2) / canvasHeight;
        const width = tempBoxData.relativeWTemp / canvasWidth;
        const height = tempBoxData.relativeHTemp / canvasHeight;

        // 只有宽和高达到 canvas宽度的1‰才认为是框
        if (width > 0.001 && height > 0.001) {
          const yoloFormatData = `${tempBoxData.relativeClassIndexTemp} ${x_center} ${y_center} ${width} ${height}`;
          setCurrentYoloContent(prevContent => prevContent ? prevContent + '\n' + yoloFormatData : yoloFormatData);

          setIsNeedAutoParseYoloToCanvas(false);// 此时不需要自动解析

          // 清空临时数据
          setTempBoxData({
            relativeClassIndexTemp: currentClassIndex,
            relativeXTemp: 0,
            relativeYTemp: 0,
            relativeWTemp: 0,
            relativeHTemp: 0,
          });
        }
        // 清空 canvasImageData
        setCanvasImageData(null);
        setIsDrawing(false); // 移到了currentYoloContent变化的钩子
        setTimeout(() => {
          setIsNeedAutoParseYoloToCanvas(true);// 此时需要自动解析
        }, 100)
      }
    }
  };

  // 监听  setCurrentClassLabelToShow 和  setCurrentClassColorToShow
  useEffect(() => {
    // console.log('currentClassLabelToShow:', currentClassLabelToShow);
    // console.log('currentClassColorToShow:', currentClassColorToShow);
  }, [currentClassLabelToShow, currentClassColorToShow]);

  // endregion

  // region 键盘事件监听
  useEffect(() => {
    const handleKeyDown = (event: { key: string; }) => {
      console.log('Key pressed:', event.key);
      if (event.key === 'Backspace') {
        console.log('Backspace pressed');
        handleDeleteBox();
      }
    };

    // 在组件挂载时添加事件监听器
    document.addEventListener('keydown', handleKeyDown);

    // 在组件卸载时移除事件监听器
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  // endregion


  // region 打tag
  const [selectedJsonName, setSelectedJsonName] = useState<string | null>(null);
  const [selectedJsonType, setSelectedJsonType] = useState<'buildingbox' | 'constants' | null>(null);

  const jsonNames = Object.keys(jsonNameColorMap);
  const jsonTypes = ['buildingbox', 'constants'];

  const [globalList, setGlobalList] = useState<{ [key: number]: { nodeName: string, nodePropertiesKeys: string[], nodePropertiesValues: string[] } }>({});

  useEffect(() => {
    if (globalList[currentIndex]) {
      const { nodeName: loadedNodeName, nodePropertiesKeys: loadedKeys, nodePropertiesValues: loadedValues } = globalList[currentIndex];
      setNodeName(loadedNodeName);
      setNodePropertiesKeys(loadedKeys || []);
      setNodePropertiesValues(loadedValues || []);
    } else {
      setNodeName('');
      setNodePropertiesKeys([]);
      setNodePropertiesValues([]);
    }
  }, [currentIndex, globalList]);

  const [parsedJsonContent, setParsedJsonContent] = useState<JsonInterface | null>(null);


  // 表示是否允许点击染色
  const [isAllowClickToFillRect, setIsAllowClickToFillRect] = useState(false);
  const handleAllowClickToFillRect = () => {
    setIsAllowClickToFillRect(!isAllowClickToFillRect);
  };

  const handleJsonNameChange = (value: string) => {
    setSelectedJsonName(value);
  };

  const handleJsonTypeChange = (value: string) => {
    setSelectedJsonType(value as 'buildingbox' | 'constants');
  };

  const parseJsonContent = (jsonContent: string | null): JsonInterface => {
    const jsonObj: JsonInterface = {
      local: {
        buildingBlocks: {},
        constants: {},
      },
      global: {},
    };

    if (!jsonContent) {
      return jsonObj;
    }

    const lines = jsonContent.split('\n');
    lines.forEach((line) => {
      const parts = line.split(':');
      if (parts.length < 3) return; // Skip invalid lines

      const [jsonTypeKey, jsonName, boxNames] = parts;
      if (jsonTypeKey === 'buildingBlocks') {
        if (!jsonObj.local.buildingBlocks[jsonName]) {
          jsonObj.local.buildingBlocks[jsonName] = [];
        }
        jsonObj.local.buildingBlocks[jsonName].push(...boxNames.split(' '));
      } else if (jsonTypeKey === 'constants') {
        if (!jsonObj.local.constants[jsonName]) {
          jsonObj.local.constants[jsonName] = [];
        }
        jsonObj.local.constants[jsonName].push(...boxNames.split(' '));
      } else if (jsonTypeKey === 'global') {
        const [nodeName, nodePropertiesKeysStr, nodePropertiesValuesStr] = jsonName.split('|');
        jsonObj.global = {
          nodeName,
          nodePropertiesKeys: nodePropertiesKeysStr.split(','),
          nodePropertiesValues: nodePropertiesValuesStr.split(','),
        };
      }
    });

    return jsonObj;
  };

  const stringifyJsonContent = (jsonObj: JsonInterface): string => {
    const lines: string[] = [];

    for (const [jsonName, boxNames] of Object.entries(jsonObj.local.buildingBlocks)) {
      const uniqueBoxNames = [...new Set(boxNames)]; // 去重
      lines.push(`buildingBlocks:${jsonName}:${uniqueBoxNames.join(' ')}`);
    }

    for (const [jsonName, boxNames] of Object.entries(jsonObj.local.constants)) {
      const uniqueBoxNames = [...new Set(boxNames)]; // 去重
      lines.push(`constants:${jsonName}:${uniqueBoxNames.join(' ')}`);
    }

    if (jsonObj.global) {
      // @ts-ignore
      const { nodeName, nodePropertiesKeys, nodePropertiesValues } = jsonObj.global;
      // Ensure that nodePropertiesKeys and nodePropertiesValues are arrays
      if (Array.isArray(nodePropertiesKeys) && Array.isArray(nodePropertiesValues)) {
        lines.push(`global:${nodeName}|${nodePropertiesKeys.join(',')}|${nodePropertiesValues.join(',')}`);
      } else {
        // Handle the case where they are not arrays
        console.error('nodePropertiesKeys or nodePropertiesValues are not arrays.');
      }
    }

    return lines.join('\n');
  };
  const handleJsonBoxClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isAllowClickToFillRect) {
      return;
    }
    const canvas = canvasRef.current;
    if (canvas && selectedJsonName && selectedJsonType) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // const yoloContentLines = currentYoloContentWithRectName?.split('\n');// 但是为什么这里必须用currentYoloContentWithRectName呢？
      // 这里如果采用 addRectNameToYoloContent(currentYoloContent) 则会导致抬起后自动绘制
      // 为什么呢？ 因为
      const yoloContentLines = addRectNameToYoloContent(currentYoloContent)?.split('\n');

      if (yoloContentLines) {
        yoloContentLines.forEach((line, index) => {
          const [boxName, classIndex, x, y, w, h] = line.split(' ');
          const boxX = parseFloat(x);
          const boxY = parseFloat(y);
          const boxW = parseFloat(w);
          const boxH = parseFloat(h);

          if (
            mouseX >= (boxX - boxW / 2) * canvas.width &&
            mouseX <= (boxX + boxW / 2) * canvas.width &&
            mouseY >= (boxY - boxH / 2) * canvas.height &&
            mouseY <= (boxY + boxH / 2) * canvas.height
          ) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = jsonNameColorMap[selectedJsonName];
              ctx.globalAlpha = 0.2;
              ctx.fillRect(
                (boxX - boxW / 2) * canvas.width,
                (boxY - boxH / 2) * canvas.height,
                boxW * canvas.width,
                boxH * canvas.height
              );
              ctx.globalAlpha = 1;// 恢复透明度
            }
            setIsNeedAutoParseJsonToCanvas(false);

            setCurrentJsonContent((prevJson) => {
              const jsonObj = parseJsonContent(prevJson);
              const jsonTypeKey = selectedJsonType === 'buildingbox' ? 'buildingBlocks' : 'constants';

              if (!jsonObj.local[jsonTypeKey][selectedJsonName]) {
                jsonObj.local[jsonTypeKey][selectedJsonName] = [];
              }
              if (!jsonObj.local[jsonTypeKey][selectedJsonName].includes(boxName)) {
                jsonObj.local[jsonTypeKey][selectedJsonName].push(boxName);
              }
              return stringifyJsonContent(jsonObj);
            });
            setTimeout(() => {
              setIsNeedAutoParseJsonToCanvas(true);
            }, 10)
          }
        });
      }
    }
  };
  // endregion
  // @ts-ignore
  return (
    <Layout className="layout-container">
      {/* 上半部分 */}
      <div className="upper-section">
        {/* 左侧 */}
        <div className="left-upper">
          {/* 功能按钮 */}
          <Card className="card-style">
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
              <input
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderUpload}
                className="input-hidden-style"
                style={{ display: 'none' }}
              />
              <Button className="button-style" onClick={() => document.querySelector('input[type="file"]')?.click()}><FontAwesomeIcon icon={faUpload} /> {t.uploadFolder}</Button>
              <Button className="button-style" onClick={handleUndo}>{t.undo}</Button>
              <Popover
                content={(
                  <div style={{ maxHeight: '200px', overflowY: 'scroll' }}>
                    <Button onClick={handleSaveCurrentYoloAndJsonToLocal}>{t.saveCurrent}</Button>
                    <Button onClick={handleSaveYoloAndJsonListToLocal}>{t.saveAll}</Button>
                  </div>
                )}
                title="保存选项"
                trigger="click"
              >
                <Button className="button-style">{t.save}</Button>
              </Popover>
              <Button className="button-style" onClick={handleDeleteBox}>{t.deleteBox}</Button>
              <Button className="button-style" onClick={handleDeleteBoxUndo}>{t.restoreDeleted}</Button>
              <Popover
                content={(
                  <div style={{ maxHeight: '200px', overflowY: 'scroll' }}>
                    {Object.keys(indexClassColorMapState).map((classIndex) => {
                      const { color, label } = indexClassColorMapState[classIndex];
                      return (
                        <Button
                          key={classIndex}
                          onClick={() => selectCurrentClassByIndex(parseInt(classIndex))}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: color === currentClassColor ? 'lightgray' : 'transparent',
                            color: color === currentClassColor ? 'black' : 'inherit',
                          }}
                        >
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              backgroundColor: color,
                              marginRight: '5px',
                              borderRadius: '50%',
                            }}
                          ></div>
                          {`Index: ${classIndex}, Class: ${label}, Color: ${color}`}
                        </Button>
                      );
                    })}
                  </div>
                )}
                title={`${currentClassIndex} : [ ${currentClassLabel} ${currentClassColor}]`}
                trigger="click"
              >
                <Button className="button-style">{t.category}</Button>
              </Popover>
              <Select
                placeholder={t.chooseJsonName}
                value={selectedJsonName}
                onChange={handleJsonNameChange}
                style={{ width: 120, marginRight: '10px' }}
              >
                {jsonNames.map((name) => (
                  <Option key={name} value={name}>{name}</Option>
                ))}
              </Select>
              <Select
                placeholder={t.chooseJsonType}
                value={selectedJsonType}
                onChange={handleJsonTypeChange}
                style={{ width: 120 }}
              >
                {jsonTypes.map((type) => (
                  <Option key={type} value={type}>{type}</Option>
                ))}
              </Select>
              <Button onClick={handleAllowClickToFillRect}>
                {isAllowClickToFillRect ? t.allowColoring : t.notAllowColoring}
              </Button>
            </div>
          </Card>
          {/* Previous, Next 等 */}
          <Card className="card-style">
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
              <Button className="button-style" onClick={handlePrevIndex}>{t.previous}</Button>
              <Button className="button-style" onClick={handleNextIndex}>{t.next}</Button>
              {t.currentFile}: {currentPng?.name}
              <InputNumber
                style={{
                  width: '100px',
                  marginLeft: '10px',
                  marginRight: '10px',
                  textAlign: 'center',
                  border: '1px solid #ccc',
                }}
                value={currentIndex + 1}
                onChange={(value) => {
                  const newIndex = parseInt(value);
                  if (!isNaN(newIndex) && newIndex >= 0 && newIndex <= pngList.length) {
                    setCurrentIndex(newIndex - 1);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    setCurrentIndex(0);
                  }
                }}
                min={0}
                max={pngList.length}
                step={1}
                parser={(value) => parseInt(value)}
                style={{ width: '50px' }}
              />
              <span style={{ marginLeft: '10px', marginRight: '10px' }}>/ {yoloList.length}</span>
              {currentClassColor && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: currentClassColor,
                      marginRight: '5px',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Index: {currentClassIndex}, Class: {currentClassLabel}, Color: {currentClassColor}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
        {/* 右侧 */}
        <div className="right-upper">
          <Card className="function-card">
            {t.function}:
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Input
                placeholder={t.nodeName}
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                style={{ marginBottom: '10px' }}
              />
              <Button onClick={handleAddNodeProperty}>{t.addProperty}</Button>
              {nodePropertiesKeys.map((key, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                  <Input
                    placeholder="Key"
                    value={key}
                    onChange={(e) => handleUpdateNodeProperty(index, 'key', e.target.value)}
                    style={{ marginRight: '10px' }}
                  />
                  <Input
                    placeholder="Value"
                    value={nodePropertiesValues[index]}
                    onChange={(e) => handleUpdateNodeProperty(index, 'value', e.target.value)}
                    style={{ marginRight: '10px' }}
                  />
                  <Button onClick={() => removeNodeProperty(index)}></Button>
                </div>
              ))}
              <Button onClick={handleCreateNode} style={{ marginTop: '10px' }}>{t.addNode}</Button>
            </div>
          </Card>
        </div>
      </div>
      {/* 下半部分 */}
      <div className="lower-section">
        <div className="left-lower">
          <div className="canvas-container">
            <canvas
              ref={canvasRef}
              className="canvas-element"
              onMouseDown={handleMouseDown}
              onMouseMove={throttledHandleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleJsonBoxClick}
            />
          </div>
        </div>
        <div className="right-lower">
          <div className="textarea-container">
            <textarea
              ref={textareaRef}
              value={addRectNameToYoloContent(currentYoloContent)}
              className="custom-textarea"
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default FileOperate;
