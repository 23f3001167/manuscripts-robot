import { useState, useCallback, useRef } from 'react';

const MODEL = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b';

// Prefer the secure server-side proxy. If VITE_GROQ_API_KEY is set, fall back
// to calling Groq directly from the browser (less secure, dev convenience).
const DIRECT_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
const ENDPOINT = DIRECT_KEY
  ? 'https://api.groq.com/openai/v1/chat/completions'
  : '/api/groq/openai/v1/chat/completions';

function buildSystemPrompt() {
  const now = new Date();
  const stamp = now.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return [
    'You are "Graduate Robot", a friendly, warm, and helpful voice assistant that lives inside a 3D robot on the Little Classroom website.',
    'Answer ANY question the user asks, just like a general-purpose AI assistant: general knowledge, science, math, coding, history, definitions, advice, small talk, and fun facts.',
    'Your reply is spoken aloud through text-to-speech, so keep it concise and conversational: one to three short sentences.',
    'Never use markdown, bullet points, emojis, asterisks, code blocks, or special formatting. Write plain, natural spoken sentences.',
    'If a question truly needs real-time data you cannot access, say so briefly and helpfully.',
    'When the user asks about the weather or temperature somewhere, call the get_current_weather tool.',
    `For reference, the current date and time is ${stamp}.`,
  ].join(' ');
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_current_weather',
      description: 'Get the current weather and temperature for a city or place.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City or place name, for example "London" or "New York".',
          },
        },
        required: ['location'],
      },
    },
  },
];

const WEATHER_CODES = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'thunderstorm with heavy hail',
};

async function getWeather(location) {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      location
    )}&count=1&language=en&format=json`
  );
  const geo = await geoRes.json();
  const place = geo.results && geo.results[0];
  if (!place) return { error: `I could not find a place called ${location}.` };

  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
  );
  const wx = await wxRes.json();
  const current = wx.current || {};

  return {
    location: `${place.name}${place.country ? ', ' + place.country : ''}`,
    temperature_celsius: current.temperature_2m,
    temperature_fahrenheit:
      current.temperature_2m != null
        ? Math.round((current.temperature_2m * 9) / 5 + 32)
        : null,
    feels_like_celsius: current.apparent_temperature,
    humidity_percent: current.relative_humidity_2m,
    wind_kmh: current.wind_speed_10m,
    condition: WEATHER_CODES[current.weather_code] || 'unknown conditions',
  };
}

async function runTool(name, args) {
  if (name === 'get_current_weather') return getWeather(args.location);
  return { error: `Unknown tool: ${name}` };
}

function stripForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function callGroq(messages) {
  const headers = { 'Content-Type': 'application/json' };
  if (DIRECT_KEY) headers['Authorization'] = `Bearer ${DIRECT_KEY}`;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.6,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch (e) {
      /* ignore */
    }
    const err = new Error(detail || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export function useGroq() {
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);
  const historyRef = useRef([]);

  const reset = useCallback(() => {
    historyRef.current = [];
  }, []);

  const ask = useCallback(async (question) => {
    setIsThinking(true);
    setError(null);

    try {
      const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...historyRef.current,
        { role: 'user', content: question },
      ];

      let answer = '';

      for (let step = 0; step < 4; step++) {
        const data = await callGroq(messages);
        const message = data.choices && data.choices[0] && data.choices[0].message;
        if (!message) throw new Error('Empty response from the model.');

        const toolCalls = message.tool_calls;
        if (toolCalls && toolCalls.length) {
          messages.push(message);
          for (const call of toolCalls) {
            let args = {};
            try {
              args = JSON.parse((call.function && call.function.arguments) || '{}');
            } catch (e) {
              /* keep {} */
            }
            let result;
            try {
              result = await runTool(call.function && call.function.name, args);
            } catch (e) {
              result = { error: String((e && e.message) || e) };
            }
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result),
            });
          }
          continue;
        }

        answer = message.content || '';
        break;
      }

      if (!answer) answer = 'Sorry, I could not come up with an answer right now.';
      const spoken = stripForSpeech(answer);

      historyRef.current.push(
        { role: 'user', content: question },
        { role: 'assistant', content: spoken }
      );
      if (historyRef.current.length > 12) {
        historyRef.current = historyRef.current.slice(-12);
      }

      return spoken;
    } catch (e) {
      const friendly =
        e.status === 401
          ? 'My brain is not connected yet. Please add your Groq API key to the .env file and restart the server.'
          : 'Sorry, I am having trouble reaching my brain right now. Please try again in a moment.';
      setError((e && e.message) || 'Groq request failed');
      return friendly;
    } finally {
      setIsThinking(false);
    }
  }, []);

  return { ask, isThinking, error, reset };
}
