// utils.js
export const saveListsToSessionStorage = (yoloList, pngList, jpgList, jsonList) => {
    sessionStorage.setItem('yoloList', JSON.stringify(yoloList));
    sessionStorage.setItem('pngList', JSON.stringify(pngList));
    sessionStorage.setItem('jpgList', JSON.stringify(jpgList));
    sessionStorage.setItem('jsonList', JSON.stringify(jsonList));
};

export const loadListsFromSessionStorage = () => {
    const yoloList = JSON.parse(sessionStorage.getItem('yoloList')) || [];
    const pngList = JSON.parse(sessionStorage.getItem('pngList')) || [];
    const jpgList = JSON.parse(sessionStorage.getItem('jpgList')) || [];
    const jsonList = JSON.parse(sessionStorage.getItem('jsonList')) || [];
    return { yoloList, pngList, jpgList, jsonList };
};
