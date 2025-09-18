import React, { useState, useEffect, useRef } from 'react';
import { box, text, useKeyboard } from '@opentui/react';
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
  const [messages, setMessages] = useState<{ type: 'user' | 'agent' | 'tool' | 'thought' | 'llm_input' | 'llm_output'; content: string }[]>([]);
  const [focusedPanel, setFocusedPanel] = useState<'fileExplorer' | 'chat'>('chat');
  const qflowAgentRef = useRef<QflowAgent | null>(null);

  // State to manage agent's request for user input
  const [waitingForAgentInput, setWaitingForAgentInput] = useState(false);
  const resolveAgentInputRef = useRef<((value: string) => void) | null>(null);

  // Function for QflowAgent to request user input
  const handleAgentQuery = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      setMessages((prevMessages) => [...prevMessages, { type: 'agent', content: `Agent needs input: ${prompt}` }]);
      setWaitingForAgentInput(true);
      resolveAgentInputRef.current = resolve;
    });
  };

  useEffect(() => {
    // DEBUG: QflowAgent constructor started.
    setMessages((prevMessages) => [...prevMessages, { type: 'agent', content: 'DEBUG: QflowAgent constructor started.' }]);
    if (!qflowAgentRef.current) {
      qflowAgentRef.current = new QflowAgent(
        (agentMessage) => {
          setMessages((prevMessages) => [...prevMessages, agentMessage]);
        },
        handleAgentQuery // Pass the new handler
      );
    }
    // DEBUG: QflowAgent constructor finished.
    setMessages((prevMessages) => [...prevMessages, { type: 'agent', content: 'DEBUG: QflowAgent constructor finished.' }]);
  }, []);

  useKeyboard((key) => {
    if (key.name === 'tab') {
      setFocusedPanel((prev) => (prev === 'chat' ? 'fileExplorer' : 'chat'));
    }
  });

  const handleSendMessage = async (message: string) => {
    // DEBUG: handleSendMessage called.
    setMessages((prevMessages) => [...prevMessages, { type: 'agent', content: 'DEBUG: handleSendMessage called with message: ' + message }]);
    setMessages((prevMessages) => [...prevMessages, { type: 'user', content: message }]);

    if (waitingForAgentInput && resolveAgentInputRef.current) {
      // If waiting for agent input, resolve the promise
      resolveAgentInputRef.current(message);
      setWaitingForAgentInput(false);
      resolveAgentInputRef.current = null;
    } else if (qflowAgentRef.current) {
      // Otherwise, send as a new goal to the Qflow agent
      // DEBUG: QflowAgent.run called.
      setMessages((prevMessages) => [...prevMessages, { type: 'agent', content: 'DEBUG: QflowAgent.run called with goal: ' + message }]);
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
        <FileExplorer
          focused={focusedPanel === 'fileExplorer'}
          colors={colors}
          onClick={() => setFocusedPanel('fileExplorer')}
          flexGrow={1} // Use flexGrow instead of fixed width
        />
        <ChatInterface
          focused={focusedPanel === 'chat'}
          onSendMessage={handleSendMessage}
          messages={messages}
          colors={colors}
          onClick={() => setFocusedPanel('chat')}
          waitingForAgentInput={waitingForAgentInput}
          flexGrow={2} // Give chat interface more space
        />
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
        <text fg={colors.foreground} content="Press TAB to switch panels | Click to focus | CTRL+C to exit" />
      </box>
    </box>
  );
}

export default App;
