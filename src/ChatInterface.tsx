import React, { useState } from 'react';
import { box, text, input } from '@opentui/core';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  messages: { type: 'user' | 'agent'; content: string }[];
  focused: boolean;
  colors: any; // Accept colors prop
}

function ChatInterface({ onSendMessage, messages, focused, colors }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleInputSubmit = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  return (
    <box
      width="50%"
      height="100%"
      borderStyle="rounded"
      borderColor={focused ? colors.focusedBorder : colors.border}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      title="Agent Chat"
      style={{
        rootOptions: { backgroundColor: colors.background },
        viewportOptions: { backgroundColor: colors.background },
      }}
    >
      <box flexDirection="column" flexGrow={1} overflow="scroll" marginBottom={1}>
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <box key={index} flexDirection="row" marginBottom={0}>
              <text fg={colors.info}>[{new Date().toLocaleTimeString()}] </text>
              <text fg={msg.type === 'user' ? colors.primary : colors.foreground}>
                {msg.type === 'user' ? 'You: ' : 'Agent: '}{msg.content}
              </text>
            </box>
          ))
        ) : (
          <text fg={colors.info}>Start chatting with the agent...</text>
        )}
      </box>
      <input
        placeholder="Type your message..."
        value={inputValue}
        onChange={handleInputChange}
        onSubmit={handleInputSubmit}
        borderStyle="single"
        borderColor={focused ? colors.focusedBorder : colors.border}
        width="100%"
        focused={focused}
        fg={colors.foreground}
        bg={colors.background}
        placeholderFg={colors.info}
        prefix={<text fg={colors.primary}> > </text>}
      />
    </box>
  );
}

export default ChatInterface;