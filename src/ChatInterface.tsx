import React, { useState } from 'react';
import { box, text, input } from '@opentui/core';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  messages: { type: 'user' | 'agent' | 'tool' | 'thought' | 'debug' | 'llm_response'; content: string }[];
  focused: boolean;
  colors: any;
  onClick?: () => void;
  waitingForAgentInput: boolean;
}

// Helper component to format and display message content
const FormattedMessageContent: React.FC<{ type: string; content: string; colors: any }> = ({ type, content, colors }) => {
  try {
    if (type === 'tool') {
      const parsedContent = JSON.parse(content);
      return (
        <box flexDirection="column">
          <text fg={colors.accent}>Tool Call: {parsedContent.tool}</text>
          <text fg={colors.info}>Arguments: {JSON.stringify(parsedContent.args, null, 2)}</text>
        </box>
      );
    }
    if (type === 'thought') {
      return <text fg={colors.secondary}>Thought: {content}</text>;
    }
    if (type === 'debug') {
      return <text fg={colors.info}>DEBUG: {content}</text>;
    }
    if (type === 'llm_response') {
      try {
        const parsedContent = JSON.parse(content);
        return (
          <box flexDirection="column">
            <text fg={colors.primary}>LLM Response:</text>
            <text fg={colors.foreground}>Thought: {parsedContent.thought}</text>
            {parsedContent.tool_calls && parsedContent.tool_calls.length > 0 && (
              <box flexDirection="column" marginLeft={2}>
                <text fg={colors.accent}>Tool Calls:</text>
                {parsedContent.tool_calls.map((tc: any, idx: number) => (
                  <box key={idx} flexDirection="column" marginLeft={2}>
                    <text fg={colors.accent}>- Tool: {tc.tool}</text>
                    <text fg={colors.info}>  Args: {JSON.stringify(tc.parameters)}</text>
                  </box>
                ))}
              </box>
            )}
          </box>
        );
      } catch (e) {
        return <text fg={colors.primary}>LLM Response: [Parsing Error] {content}</text>;
      }
    }
  } catch (e) {
    // If parsing fails, display raw content with an error indicator
    return <text fg={colors.error}>[Parsing Error] {content}</text>;
  }
  // Default display for other types or if not parsed
  return <text fg={colors.foreground}>{content}</text>;
};

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
      <box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={1}>
        <text fg={colors.foreground}>Agent Chat</text>
      </box>
      <box flexDirection="column" flexGrow={1} overflow="scroll" marginBottom={1}>
        {messages.map((msg, index) => (
          <box key={index} flexDirection="row" marginBottom={0}>
            <text fg={colors.info}>[{new Date().toLocaleTimeString()}] </text>
            <FormattedMessageContent type={msg.type} content={msg.content} colors={colors} />
          </box>
        ))}
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
