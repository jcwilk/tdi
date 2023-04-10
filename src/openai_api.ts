// openaiApi.ts
import { Configuration, OpenAIApi, CreateCompletionResponse } from 'openai';
import { AxiosError } from 'axios';

export const getCompletion = async (
  apiKey: string,
  prompt: string,
  max_tokens: number
): Promise<string | null> => {
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  const openai = new OpenAIApi(configuration);

  try {
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt,
      max_tokens: max_tokens,
    });

    const responseData = completion.data as CreateCompletionResponse;
    return responseData.choices[0].text as string;
  } catch (error) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      console.log(axiosError.response.status);
      console.log(axiosError.response.data);
    } else {
      console.log(axiosError.message);
    }
    return null;
  }
};
