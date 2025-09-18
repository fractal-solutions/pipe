import React, { useState } from 'react';
import { box, text, input } from '@opentui/core';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  messages: { type: 'user' | 'agent' | 'tool' | 'thought' | 'llm_input' | 'llm_output'; content: string }[];
  focused: boolean;
  colors: any;
  onClick?: () => void;
  waitingForAgentInput: boolean;
}

// Helper component to format and display message content
const FormattedMessageContent: React.FC<{ type: string; content: string; colors: any }> = ({ type, content, colors }) => {
  try {
    if (type === 'llm_input' || type === 'llm_output' || type === 'tool') {
      const parsedContent = JSON.parse(content);

      if (type === 'tool') {
        // Display tool name and arguments clearly
        return (
          <box flexDirection="column">
            <text fg={colors.accent} wordWrapping="long-words">Tool: {parsedContent.tool}</text>
            <text fg={colors.info} wordWrapping="long-words">Args: {JSON.stringify(parsedContent.args, null, 2)}</text>
          </box>
        );
      } else if (type === 'llm_input') {
        // For LLM Input, display the prompt clearly
        const prompt = parsedContent.prompt || content; // Fallback to raw content
        return (
          <box flexDirection="column">
            <text fg={colors.secondary} wordWrapping="long-words">LLM Input:</text>
            <text fg={colors.foreground} wordWrapping="long-words">{prompt}</text>
          </box>
        );
      } else if (type === 'llm_output') {
        // For LLM Output, try to extract thought and tool_calls if present
        const message = parsedContent.choices?.[0]?.message;
        if (message) {
          return (
            <box flexDirection="column">
              <text fg={colors.secondary} wordWrapping="long-words">LLM Output:</text>
              {message.content && <text fg={colors.foreground} wordWrapping="long-words">Content: {message.content}</text>}
              {message.tool_calls && message.tool_calls.length > 0 && (
                <box flexDirection="column">
                  <text fg={colors.accent} wordWrapping="long-words">Tool Calls:</text>
                  {message.tool_calls.map((tc: any, idx: number) => (
                    <box key={idx} flexDirection="column" marginLeft={2}>
                      <text fg={colors.accent} wordWrapping="long-words">- Tool: {tc.function.name}</text>
                      <text fg={colors.info} wordWrapping="long-words">  Args: {tc.function.arguments}</text>
                    </box>
                  ))}
                </box>
              )}
            </box>
          );
        } else {
          // Fallback for unexpected LLM output structure
          return <text fg={colors.foreground} wordWrapping="long-words">Raw LLM Output: {JSON.stringify(parsedContent, null, 2)}</text>;
        }
      }
    }
  } catch (e) {
    // If parsing fails, display raw content with an error indicator
    return <text fg={colors.error} wordWrapping="long-words">[Parsing Error] {content}</text>;
  }
  // Default display for other types or if not parsed
  return <text fg={colors.foreground} wordWrapping="long-words">{content}</text>;
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
