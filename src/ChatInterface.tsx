import React, { useState } from 'react';
import { box, text, input } from '@opentui/core';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  messages: { type: 'user' | 'agent' | 'tool' | 'thought' | 'llm_input' | 'llm_output'; content: string }[]; // Updated message type
  focused: boolean;
  colors: any;
  onClick?: () => void;
  waitingForAgentInput: boolean;
}

function ChatInterface({ onSendMessage, messages, focused, colors, onClick, waitingForAgentInput }: ChatInterfaceProps) {
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
      onClick={onClick}
    >
      <box flexDirection="column" flexGrow={1} overflow="scroll" marginBottom={1}>
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <box key={index} flexDirection="row" marginBottom={0}>
              <text fg={colors.info}>[{new Date().toLocaleTimeString()}] </text>
              <text
                fg={msg.type === 'user' ? colors.primary : (msg.type === 'tool' ? colors.accent : (msg.type === 'thought' ? colors.info : (msg.type === 'llm_input' || msg.type === 'llm_output' ? colors.secondary : colors.foreground)))}
                flexGrow={1}
                flexShrink={1}
              >
                {msg.type === 'user' ? 'You: ' : (msg.type === 'tool' ? 'Tool: ' : (msg.type === 'thought' ? 'Thought: ' : (msg.type === 'llm_input' ? 'LLM Input: ' : (msg.type === 'llm_output' ? 'LLM Output: ' : 'Agent: ' ))))}{msg.content}
              </text>
            </box>
          ))
        ) : (
          <text fg={colors.info}>Start chatting with the agent...</text>
        )}
      </box>
      <input
        placeholder={waitingForAgentInput ? "Agent is waiting for your input..." : "Type your message..."}
        value={inputValue}
        onChange={handleInputChange}
        onSubmit={handleInputSubmit}
        borderStyle="single"
        borderColor={focused ? colors.focusedBorder : (waitingForAgentInput ? colors.accent : colors.border)}
        width="100%"
        focused={focused}
        fg={colors.foreground}
        bg={colors.background}
        placeholderFg={colors.info}
        prefix={<text fg={waitingForAgentInput ? colors.accent : colors.primary}> {waitingForAgentInput ? '>>' : '>'} </text>}
      />
    </box>
  );
}

export default ChatInterface;
