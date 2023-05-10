import { CompletionProcessingStrategy } from "./completion_processing_strategy"
import { InputProcessingStrategy } from "./input_processing_strategy"
import { TestProcessingStrategy } from "./test_processing_strategy"
import { ChatProcessingStrategy } from "./chat_processing_strategy"

export class StrategyFactory {
  static createStrategy(type: string) {
    switch (type) {
      case 'input':
        return new InputProcessingStrategy();
      case 'completion':
        return new CompletionProcessingStrategy();
      case 'test':
        return new TestProcessingStrategy();
      case 'chat':
        return new ChatProcessingStrategy();
      default:
        throw new Error(`Unknown strategy type: ${type}`);
    }
  }
}

export type StrategyType = 'input' | 'completion' | 'test' | 'chat';

export function isStrategyType(value: string): value is StrategyType {
  return value === 'input' || value === 'completion' || value === 'test';
}
