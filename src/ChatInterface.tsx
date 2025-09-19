import React, { useState } from 'react';
import { box, text, input, scrollbox, useTerminalDimensions } from '@opentui/react';

interface ChatInterfaceProps {
  onSendMessage: (message: string) => void;
  messages: { type: 'user' | 'agent' | 'tool' | 'thought' | 'debug' | 'llm_response'; content: string }[];
  focused: boolean;
  colors: any;
  onClick?: () => void;
  waitingForAgentInput: boolean;
  flexGrow?: number;
}

const MessageContainer: React.FC<{ timestamp: string; type: string; colors: any; children: React.ReactNode }> = ({ timestamp, type, colors, children }) => {
  return (
    <box flexDirection="row" marginBottom={0}>
      <text fg={colors.info}>[{timestamp}] </text>
      <box flexDirection="column" flexGrow={1}>
        {children}
      </box>
    </box>
  );
};

// Helper component to format and display message content
const FormattedMessageContent: React.FC<{ type: string; content: string; colors: any; flexGrow?: number }> = ({ type, content, colors, flexGrow }) => {
  // This component will be replaced by specialized components
  return <text fg={colors.foreground}>{content}</text>;
};

function ChatInterface({ onSendMessage, messages, focused, colors, onClick, waitingForAgentInput, flexGrow }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const { width: terminalWidth } = useTerminalDimensions();
  const MAX_LINE_LENGTH = Math.floor(terminalWidth * 0.8); // Adjust 0.8 as needed for padding/margins

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
          <MessageContainer
            key={index}
            timestamp={new Date().toLocaleTimeString()}
            type={msg.type}
            colors={colors}
          >
            {msg.type === 'user' && <UserMessage content={msg.content} colors={colors} maxLength={MAX_LINE_LENGTH} />}
            {msg.type === 'agent' && <AgentMessage content={msg.content} colors={colors} maxLength={MAX_LINE_LENGTH} />}
            {msg.type === 'thought' && <AgentThought content={msg.content} colors={colors} maxLength={MAX_LINE_LENGTH} />}
            {msg.type === 'tool' && <ToolCallDisplay content={msg.content} colors={colors} maxLength={MAX_LINE_LENGTH} />}
            {msg.type === 'llm_response' && <LLMResponseDisplay content={msg.content} colors={colors} maxLength={MAX_LINE_LENGTH} />}
            {msg.type === 'debug' && <DebugMessage content={msg.content} colors={colors} maxLength={MAX_LINE_LENGTH} />}
          </MessageContainer>
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

const UserMessage: React.FC<{ content: string; colors: any; maxLength: number }> = ({ content, colors, maxLength }) => {
  const wrappedLines = wrapText(content, maxLength);
  return (
    <box flexDirection="column">
      {wrappedLines.map((line, i) => (
        <text key={i} fg={colors.foreground}>{line}</text>
      ))}
    </box>
  );
};

const AgentMessage: React.FC<{ content: string; colors: any; maxLength: number }> = ({ content, colors, maxLength }) => {
  const wrappedLines = wrapText(content, maxLength);
  return (
    <box flexDirection="column">
      {wrappedLines.map((line, i) => (
        <text key={i} fg={colors.primary}>{line}</text>
      ))}
    </box>
  );
};

const AgentThought: React.FC<{ content: string; colors: any; maxLength: number }> = ({ content, colors, maxLength }) => {
  const wrappedLines = wrapText(content, maxLength);
  return (
    <box flexDirection="column">
      {wrappedLines.map((line, i) => (
        <text key={i} fg={colors.secondary}>{i === 0 ? 'Thought: ' : ''}{line}</text>
      ))}
    </box>
  );
};

const DebugMessage: React.FC<{ content: string; colors: any; maxLength: number }> = ({ content, colors, maxLength }) => {
  const wrappedLines = wrapText(content, maxLength);
  return (
    <box flexDirection="column">
      {wrappedLines.map((line, i) => (
        <text key={i} fg={colors.info}>{i === 0 ? 'DEBUG: ' : ''}{line}</text>
      ))}
    </box>
  );
};

const LLMResponseDisplay: React.FC<{ content: string; colors: any; maxLength: number }> = ({ content, colors, maxLength }) => {

  try {
    const parsedContent = JSON.parse(content);
    const messageContent = parsedContent.choices?.[0]?.message?.content;
    const toolCalls = parsedContent.choices?.[0]?.message?.tool_calls;

    return (
      <box flexDirection="column">
        <text fg={colors.primary}>LLM Response:</text>
        {messageContent && (
          <box flexDirection="column">
            {wrapText(messageContent, maxLength).map((line, i) => (
              <text key={i} fg={colors.foreground}>{i === 0 ? 'Thought: ' : ''}{line}</text>
            ))}
          </box>
        )}
        {toolCalls && toolCalls.length > 0 && (
          <box flexDirection="column" marginLeft={2}>
            <text fg={colors.accent}>Tool Calls:</text>
            {toolCalls.map((tc: any, idx: number) => (
              <box key={idx} flexDirection="column" marginLeft={2}>
                <text fg={colors.accent}>- Tool: {tc.function.name}</text>
                {wrapText(tc.function.arguments, maxLength).map((line, i) => (
                  <text key={i} fg={colors.info}>{i === 0 ? '  Args: ' : ''}{line}</text>
                ))}
              </box>
            ))}
          </box>
        )}
      </box>
    );
  } catch (e: any) {
    const wrappedLines = wrapText(`LLM Response: [Parsing Error] ${content}`, maxLength);
    return (
      <box flexDirection="column">
        {wrappedLines.map((line, i) => (
          <text key={i} fg={colors.primary}>{i === 0 ? 'LLM Response: [Parsing Error] ' : ''}{line}</text>
        ))}
      </box>
    );
  }
};

const formatOutput = (output: any): string => {
  try {
    const parsed = JSON.parse(String(output));
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    return String(output);
  }
};

const ToolCallDisplay: React.FC<{ content: string; colors: any; maxLength: number }> = ({ content, colors, maxLength }) => {

  try {
    const parsedContent = JSON.parse(content);

    return (
      <box flexDirection="column">
        {wrapText(`Tool Call: ${parsedContent.tool}`, maxLength).map((line, i) => (
          <text key={i} fg={colors.accent}>{line}</text>
        ))}
        <box flexDirection="column" marginLeft={2}>
          <text fg={colors.info}>Arguments:</text>
          {wrapText(JSON.stringify(parsedContent.args, null, 2), maxLength).map((line: string, i: number) => (
            <text key={i} fg={colors.foreground} marginLeft={2}>{line}</text>
          ))}
        </box>
        {parsedContent.output && (
          <box flexDirection="column" marginLeft={2} marginTop={1}>
            <text fg={colors.success}>Output:</text>
            {formatOutput(parsedContent.output).split('\n').map((line: string, i: number) => (
              <text key={i} fg={colors.foreground} marginLeft={2}>{line}</text>
            ))}
          </box>
        )}
      </box>
    );
  } catch (e: any) {
    return (
      <box flexDirection="column">
        <text fg={colors.error}>Error parsing tool content: {e.message}</text>
        <text fg={colors.info}>Raw content: {content}</text>
      </box>
    );
  }
};


export default ChatInterface;