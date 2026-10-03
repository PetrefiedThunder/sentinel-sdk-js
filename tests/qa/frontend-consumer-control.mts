// Positive control: package exports resolve under a strict NodeNext consumer.
import { SentinelClient } from 'sentinel-oversight';
import { gated as gateAi } from 'sentinel-oversight/ai-sdk';
import { gated as gateAgents } from 'sentinel-oversight/openai-agents';
import { gated as gateMastra } from 'sentinel-oversight/mastra';
import { SentinelCallbackHandler } from 'sentinel-oversight/langchain';

const client = new SentinelClient({ apiKey: 'qa-synthetic', apiUrl: 'https://qa.invalid' });
gateAi({ execute: async (...args: unknown[]) => args }, { client });
gateAgents({ invoke: async (...args: unknown[]) => args }, { client });
gateMastra({ execute: async (...args: unknown[]) => args }, { client });
new SentinelCallbackHandler({ client });
