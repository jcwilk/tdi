import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';

export async function getCompletion(apiKey: string, prompt: string, maxTokens: number = 2000, temperature: number): Promise<string | null> {
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);

  try {
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt,
      max_tokens: maxTokens,
      temperature
    });

    return completion.data.choices[0].text;
  } catch (error) {
    console.error('Error getting completion:', error);
    return null;
  }
}
