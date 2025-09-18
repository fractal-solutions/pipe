import { AsyncFlow } from '@fractal-solutions/qflow';
import { AgentNode, DeepSeekLLMNode } from '@fractal-solutions/qflow/nodes';

// Define a type for the messages that the agent will process
interface AgentMessage {
  type: 'user' | 'agent';
  content: string;
}

class QflowAgent {
  private agentFlow: AsyncFlow;
  private agentNode: AgentNode;
  private llm: DeepSeekLLMNode; // Using DeepSeekLLMNode as an example
  private tools: Record<string, any>; // Define a more specific type later

  constructor(onAgentMessage: (message: AgentMessage) => void) {
    // Initialize LLM (replace with actual API key from .env)
    this.llm = new DeepSeekLLMNode();
    this.llm.setParams({ apiKey: process.env.DEEPSEEK_API_KEY || '' });

    // Initialize tools (for now, just a placeholder)
    this.tools = {
      // Example tool: shell_command: new ShellCommandNode(),
    };

    this.agentNode = new AgentNode(this.llm, this.tools);

    // Custom prepAsync to get the goal from the shared state
    this.agentNode.prepAsync = async (shared: any) => {
      if (shared.goal) {
        this.agentNode.setParams({ goal: shared.goal });
        onAgentMessage({ type: 'agent', content: `Agent received goal: "${shared.goal}"` });
      } else {
        onAgentMessage({ type: 'agent', content: 'Agent started without a specific goal.' });
      }
    };

    // Custom postAsync to handle agent's output and send it to the TUI
    this.agentNode.postAsync = async (shared: any, prepRes: any, execRes: any) => {
      onAgentMessage({ type: 'agent', content: `Agent output: ${JSON.stringify(execRes)}` });
      return 'default';
    };

    this.agentFlow = new AsyncFlow(this.agentNode);
  }

  async run(goal: string) {
    const sharedState = { goal };
    try {
      await this.agentFlow.runAsync(sharedState);
    } catch (error: any) {
      console.error('Qflow Agent Error:', error);
      // Send error message to TUI
      // onAgentMessage({ type: 'agent', content: `Error: ${error.message}` });
    }
  }
}

export default QflowAgent;
