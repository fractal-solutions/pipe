import React, { useState, useEffect } from 'react';
import { box, text, scrollbox, useKeyboard } from '@opentui/react';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface FileExplorerProps {
  focused: boolean;
  colors: any;
  onClick?: () => void; // Add onClick prop
}

interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number | null;
  mtime: Date | null; // Modification time
}

function FileExplorer({ focused, colors, onClick }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState('.');
  const [items, setItems] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const readDirectory = async () => {
      try {
        const dirPath = path.resolve(currentPath);
        const dirents = await fs.readdir(dirPath, { withFileTypes: true });

        const fileItems: FileItem[] = await Promise.all(
          dirents.map(async (dirent) => {
            const itemPath = path.join(dirPath, dirent.name);
            let size: number | null = null;
            let mtime: Date | null = null;
            let isDirectory = dirent.isDirectory();

            try {
              const stats = await fs.stat(itemPath);
              size = stats.size;
              mtime = stats.mtime;
              isDirectory = stats.isDirectory(); // More accurate check
            } catch (statErr) {
              // Ignore errors for inaccessible files, treat as regular file
              console.warn(`Could not stat ${itemPath}:`, statErr);
            }

            return {
              name: dirent.name,
              isDirectory,
              size,
              mtime,
            };
          })
        );

        // Sort directories first, then files, both alphabetically
        fileItems.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        setItems(fileItems);
        setError(null);
        setSelectedIndex(0); // Reset selection when directory changes
      } catch (err: any) {
        setError(`Error reading directory: ${err.message}`);
        setItems([]);
      }
    };
    readDirectory();
  }, [currentPath]);

  useKeyboard((key) => {
    if (!focused) return; // Only respond to keyboard events if focused

    if (key.name === 'up') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.name === 'down') {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
    } else if (key.name === 'return') { // Enter key
      if (items.length > 0) {
        const selectedItem = items[selectedIndex];
        const newPath = path.join(currentPath, selectedItem.name);
        
        if (selectedItem.isDirectory) {
          setCurrentPath(newPath);
        } else {
          // For now, just log file selection. Later, we might open it or pass to agent.
          // console.log(`Selected file: ${newPath}`);
          // onFileSelect(newPath);
        }
      }
    } else if (key.name === 'backspace') {
      const parentPath = path.dirname(currentPath);
      // Ensure we don't go above the root of the application's starting directory
      // path.resolve('.') gives the absolute path of the starting directory
      if (path.resolve(parentPath) !== path.resolve(currentPath)) { 
        setCurrentPath(parentPath);
      }
    }
  });

  const formatSize = (size: number | null): string => {
    if (size === null) return '---';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatTime = (date: Date | null): string => {
    if (date === null) return '---';
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <scrollbox
      width="50%"
      height="100%"
      borderStyle="rounded"
      borderColor={focused ? colors.focusedBorder : colors.border}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      focused={focused}
      title="File Explorer"
      style={{
        rootOptions: { backgroundColor: colors.background },
        viewportOptions: { backgroundColor: colors.background },
      }}
      onClick={onClick} // Pass onClick to scrollbox
    >
      <text fg={colors.primary}>Current Path: {currentPath}</text>
      {error && <text fg={colors.error}>Error: {error}</text>}
      <box flexDirection="column" flexGrow={1} overflow="scroll" marginTop={1}>
        {items.length > 0 ? (
          items.map((item, index) => {
            const isSelected = index === selectedIndex;
            const itemColor = item.isDirectory ? colors.accent : colors.foreground;
            const prefix = item.isDirectory ? '[D] ' : '[F] ';

            return (
              <text
                key={item.name}
                fg={itemColor}
                bg={isSelected ? colors.info : undefined}
              >
                {prefix}{item.name.padEnd(30)} {item.isDirectory ? '' : formatSize(item.size).padEnd(10)} {formatTime(item.mtime)}
              </text>
            );
          })
        ) : (
          !error && <text fg={colors.info}>No items found or directory is empty.</text>
        )}
      </box>
    </scrollbox>
  );
}

export default FileExplorer;