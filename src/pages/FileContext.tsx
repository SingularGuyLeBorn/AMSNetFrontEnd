// FileContext.tsx
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface FileContextType {
  pngList: File[];
  setPngList: React.Dispatch<React.SetStateAction<File[]>>;
  yoloList: File[];
  setYoloList: React.Dispatch<React.SetStateAction<File[]>>;
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  currentYoloContent: string | null;
  setCurrentYoloContent: React.Dispatch<React.SetStateAction<string | null>>;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

export const FileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pngList, setPngList] = useState<File[]>([]);
  const [yoloList, setYoloList] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentYoloContent, setCurrentYoloContent] = useState<string | null>(null);

  return (
    <FileContext.Provider value={{ pngList, setPngList, yoloList, setYoloList, currentIndex, setCurrentIndex, currentYoloContent, setCurrentYoloContent }}>
      {children}
    </FileContext.Provider>
  );
};

export const useFileContext = () => {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
};
