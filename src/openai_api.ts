import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';

export async function getCompletion(apiKey: string, prompt: string, temperature: number): Promise<string | null> {
  const configuration = new Configuration({ apiKey });
  const openai = new OpenAIApi(configuration);

  try {
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt,
      max_tokens: 2000,
      temperature
    });

    return completion.data.choices[0].text;
  } catch (error) {
    console.error('Error getting completion:', error);
    return null;
  }
}
