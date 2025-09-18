import React, { useState, useEffect, useRef } from 'react';
import { box, text, useKeyboard } from '@opentui/react'; // Import useKeyboard from @opentui/react
import FileExplorer from './FileExplorer';
import ChatInterface from './ChatInterface';
import QflowAgent from './qflowAgent';

// Define a simple color palette
const colors = {
  primary: '#8be9fd', // Cyan
  secondary: '#ff79c6', // Pink
  accent: '#bd93f9', // Purple
  background: '#282a36', // Dark background
  foreground: '#f8f8f2', // Light foreground
  border: '#44475a', // Grayish border
  focusedBorder: '#50fa7b', // Green for focused elements
  error: '#ff5555', // Red
  info: '#6272a4', // Gray-blue
};

function App() {
  const [messages, setMessages] = useState<{ type: 'user' | 'agent'; content: string }[]>([]);
  const [focusedPanel, setFocusedPanel] = useState<'fileExplorer' | 'chat'>('chat'); // Start with chat focused
  const qflowAgentRef = useRef<QflowAgent | null>(null);

  useEffect(() => {
    // Initialize QflowAgent once when the component mounts
    if (!qflowAgentRef.current) {
      qflowAgentRef.current = new QflowAgent((agentMessage) => {
        setMessages((prevMessages) => [...prevMessages, agentMessage]);
      });
    }
  }, []);

  useKeyboard((key) => {
    if (key.name === 'tab') {
      setFocusedPanel((prev) => (prev === 'chat' ? 'fileExplorer' : 'chat'));
    }
  });

  const handleSendMessage = async (message: string) => {
    setMessages((prevMessages) => [...prevMessages, { type: 'user', content: message }]);

    if (qflowAgentRef.current) {
      // Send the user's message as a goal to the Qflow agent
      await qflowAgentRef.current.run(message);
    } else {
      setMessages((prevMessages) => [
        ...prevMessages,
        { type: 'agent', content: 'Error: Qflow Agent not initialized.' },
      ]);
    }
  };

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={colors.background}
      borderStyle="heavy"
      borderColor={colors.border}
    >
      {/* Header */}
      <box
        height={3}
        borderStyle="single"
        borderColor={colors.border}
        backgroundColor={colors.info}
        justifyContent="center"
        alignItems="center"
        marginBottom={1}
      >
        <text fg={colors.foreground} content="Qflow CLI Agent - Engineering Marvel Edition" />
      </box>

      {/* Main Content Area */}
      <box flexDirection="row" flexGrow={1}>
        <FileExplorer focused={focusedPanel === 'fileExplorer'} colors={colors} />
        <ChatInterface focused={focusedPanel === 'chat'} onSendMessage={handleSendMessage} messages={messages} colors={colors} />
      </box>

      {/* Footer */}
      <box
        height={2}
        borderStyle="single"
        borderColor={colors.border}
        backgroundColor={colors.info}
        justifyContent="center"
        alignItems="center"
        marginTop={1}
      >
        <text fg={colors.foreground} content="Press TAB to switch panels | CTRL+C to exit" />
      </box>
    </box>
  );
}

export default App;
