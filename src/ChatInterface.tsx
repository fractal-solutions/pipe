import React, { useState } from 'react';
import { box, text, input, scrollbox } from '@opentui/react';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  messages: { type: 'user' | 'agent' | 'tool' | 'thought' | 'debug' | 'llm_response'; content: string }[];
  focused: boolean;
  colors: any;
  onClick?: () => void;
  waitingForAgentInput: boolean;
  flexGrow?: number;
}

const wrapText = (text: string, maxLength: number): string[] => {
  const lines: string[] = [];
  let currentLine = '';
  const words = text.split(' ');

  for (const word of words) {
    if ((currentLine + word).length <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
};

// Helper component to format and display message content
const FormattedMessageContent: React.FC<{ type: string; content: string; colors: any }> = ({ type, content, colors }) => {
  const MAX_LINE_LENGTH = 60; // Adjust as needed

  try {
    if (type === 'tool') {
      const parsedContent = JSON.parse(content);
      return (
        <box flexDirection="column">
          <text fg={colors.accent}>Tool Call: {parsedContent.tool}</text>
          {wrapText(JSON.stringify(parsedContent.args, null, 2), MAX_LINE_LENGTH).map((line, i) => (
            <text key={i} fg={colors.info}>Arguments: {line}</text>
          ))}
          {parsedContent.output && wrapText(JSON.stringify(parsedContent.output, null, 2), MAX_LINE_LENGTH).map((line, i) => (
            <text key={i} fg={colors.success}>Output: {line}</text>
          ))}
        </box>
      );
    }
    if (type === 'thought') {
      return (
        <box flexDirection="column">
          {wrapText(content, MAX_LINE_LENGTH).map((line, i) => (
            <text key={i} fg={colors.secondary}>Thought: {line}</text>
          ))}
        </box>
      );
    }
    if (type === 'debug') {
      return (
        <box flexDirection="column">
          {wrapText(content, MAX_LINE_LENGTH).map((line, i) => (
            <text key={i} fg={colors.info}>DEBUG: {line}</text>
          ))}
        </box>
      );
    }
    if (type === 'llm_response') {
      try {
        const parsedContent = JSON.parse(content);
        const messageContent = parsedContent.choices?.[0]?.message?.content;
        const toolCalls = parsedContent.choices?.[0]?.message?.tool_calls;

        return (
          <box flexDirection="column">
            <text fg={colors.primary}>LLM Response:</text>
            {messageContent && wrapText(messageContent, MAX_LINE_LENGTH).map((line, i) => (
              <text key={i} fg={colors.foreground}>Thought: {line}</text>
            ))}
            {toolCalls && toolCalls.length > 0 && (
              <box flexDirection="column" marginLeft={2}>
                <text fg={colors.accent}>Tool Calls:</text>
                {toolCalls.map((tc: any, idx: number) => (
                  <box key={idx} flexDirection="column" marginLeft={2}>
                    <text fg={colors.accent}>- Tool: {tc.function.name}</text>
                    {wrapText(tc.function.arguments, MAX_LINE_LENGTH).map((line, i) => (
                      <text key={i} fg={colors.info}>  Args: {line}</text>
                    ))}
                  </box>
                ))}
              </box>
            )}
          </box>
        );
      } catch (e) {
        return (
          <box flexDirection="column">
            {wrapText(`LLM Response: [Parsing Error] ${content}`, MAX_LINE_LENGTH).map((line, i) => (
              <text key={i} fg={colors.primary}>{line}</text>
            ))}
          </box>
        );
      }
    }
  } catch (e) {
    // If parsing fails, display raw content with an error indicator
    return (
      <box flexDirection="column">
        {wrapText(`[Parsing Error] ${content}`, MAX_LINE_LENGTH).map((line, i) => (
          <text key={i} fg={colors.error}>{line}</text>
        ))}
      </box>
    );
  }
  // Default display for other types or if not parsed
  return (
    <box flexDirection="column">
      {wrapText(content, MAX_LINE_LENGTH).map((line, i) => (
        <text key={i} fg={colors.foreground}>{line}</text>
      ))}
    </box>
  );
};

function ChatInterface({ onSendMessage, messages, focused, colors, onClick, waitingForAgentInput, flexGrow }: ChatInterfaceProps) {
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
      flexGrow={flexGrow}
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
      <scrollbox
        flexGrow={1}
        marginBottom={1}
        focused={focused}
        stickyScroll={true}
        stickyStart="bottom"
      >
        {messages.map((msg, index) => (
          <box key={index} flexDirection="row" marginBottom={0}>
            <text fg={colors.info}>[{new Date().toLocaleTimeString()}] </text>
            <FormattedMessageContent type={msg.type} content={msg.content} colors={colors} />
          </box>
        ))}
      </scrollbox>
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