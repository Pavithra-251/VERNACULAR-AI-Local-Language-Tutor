import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface Accent {
  id: string;
  name: string;
  langCode: string;
}

export interface Dialect {
  id: string;
  name: string;
  region: string;
  description: string;
  flag: string;
  accents: Accent[];
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const DIALECTS: Dialect[] = [
  { 
    id: 'ny-english', 
    name: 'New York Street', 
    region: 'USA', 
    description: 'Learn the grit and slang of the Big Apple.', 
    flag: '🇺🇸',
    accents: [
      { id: 'ny-brooklyn', name: 'Brooklyn', langCode: 'en-US' },
      { id: 'ny-bronx', name: 'The Bronx', langCode: 'en-US' },
      { id: 'ny-queens', name: 'Queens', langCode: 'en-US' }
    ]
  },
  { 
    id: 'london-cockney', 
    name: 'London Cockney', 
    region: 'UK', 
    description: 'Master the rhyming slang and East End charm.', 
    flag: '🇬🇧',
    accents: [
      { id: 'london-east', name: 'East End', langCode: 'en-GB' },
      { id: 'london-south', name: 'South London', langCode: 'en-GB' }
    ]
  },
  { 
    id: 'paris-slang', 
    name: 'Parisian Argot', 
    region: 'France', 
    description: 'Speak like a true Parisian in the cafes of Le Marais.', 
    flag: '🇫🇷',
    accents: [
      { id: 'paris-standard', name: 'Standard Parisian', langCode: 'fr-FR' },
      { id: 'paris-banlieue', name: 'Banlieue', langCode: 'fr-FR' }
    ]
  },
  { 
    id: 'mumbai-tapori', 
    name: 'Mumbai Tapori', 
    region: 'India', 
    description: 'Get the local vibe of the Maximum City.', 
    flag: '🇮🇳',
    accents: [
      { id: 'mumbai-colaba', name: 'Colaba', langCode: 'hi-IN' },
      { id: 'mumbai-bandra', name: 'Bandra', langCode: 'hi-IN' }
    ]
  },
  { 
    id: 'tokyo-slang', 
    name: 'Tokyo Street', 
    region: 'Japan', 
    description: 'Modern youth slang from Shibuya and Harajuku.', 
    flag: '🇯🇵',
    accents: [
      { id: 'tokyo-shibuya', name: 'Shibuya', langCode: 'ja-JP' },
      { id: 'tokyo-shinjuku', name: 'Shinjuku', langCode: 'ja-JP' }
    ]
  },
];

export const SCENARIOS: Scenario[] = [
  { id: 'restaurant', title: 'Ordering Food', description: 'Navigate a local eatery like a regular.', icon: 'Utensils' },
  { id: 'party', title: 'At a Party', description: 'Socialize and use casual greetings.', icon: 'PartyPopper' },
  { id: 'market', title: 'Street Market', description: 'Haggle and interact with vendors.', icon: 'ShoppingBag' },
  { id: 'directions', title: 'Asking Directions', description: 'Get around using local landmarks.', icon: 'MapPin' },
];

export interface Tutor {
  id: string;
  name: string;
  personality: string;
  avatar: string;
  voice: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
}

export const TUTORS: Tutor[] = [
  { id: 'legend', name: 'The Street Legend', personality: 'Extremely casual, uses maximum slang, very "cool" and direct.', avatar: '🕶️', voice: 'Fenrir' },
  { id: 'guide', name: 'The Cultural Guide', personality: 'Balanced and informative. Teaches slang while explaining the history and etiquette behind it.', avatar: '📚', voice: 'Zephyr' },
  { id: 'neighbor', name: 'The Friendly Neighbor', personality: 'Warm, approachable, and patient. Uses common slang that is safe for beginners.', avatar: '🏠', voice: 'Kore' },
  { id: 'artist', name: 'The Hip-Hop Artist', personality: 'Rhythmic, creative, uses modern urban slang and metaphors.', avatar: '🎤', voice: 'Puck' },
  { id: 'elder', name: 'The Wise Elder', personality: 'Uses old-school slang, very respectful, full of local history and proverbs.', avatar: '👵', voice: 'Charon' },
];

export async function generateSpeech(text: string, voice: string = 'Zephyr') {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice as any },
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}

export async function getTutorResponse(
  dialect: Dialect,
  scenario: Scenario,
  tutor: Tutor,
  accent: Accent,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  userInput: string
) {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [...history, { role: 'user', parts: [{ text: userInput }] }],
    config: {
      systemInstruction: `You are a local language tutor for the "${dialect.name}" dialect in the "${dialect.region}" region. 
      Your persona is "${tutor.name}": ${tutor.personality}
      You speak with a specific regional accent: "${accent.name}".
      The current scenario is "${scenario.title}: ${scenario.description}".
      
      Your goal is to help the user speak like a REAL local, not a textbook learner.
      1. Use local slang, idioms, and regional expressions appropriate for your persona and the ${accent.name} accent.
      2. Stay in character as a local person in this scenario.
      3. After your in-character response, provide a brief "Local Tip" explaining one slang term or cultural nuance used. 
      4. In the "Local Tip", ALWAYS include the phonetic pronunciation for the slang term in brackets, e.g., "Slang Term [pronunciation]".
      5. Keep responses concise and engaging.
      6. Encourage the user to use the slang you teach.`,
    },
  });

  const result = await model;
  return result.text;
}

export async function getFeedback(
  dialect: Dialect,
  scenario: Scenario,
  conversation: string
) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this conversation in the "${dialect.name}" dialect during a "${scenario.title}" scenario. 
    Provide feedback in JSON format with the following structure:
    {
      "grammar": "score 1-10 and brief comment",
      "slangUsage": "score 1-10 and brief comment",
      "culturalAccuracy": "score 1-10 and brief comment",
      "suggestions": ["suggestion 1", "suggestion 2"],
      "pointsEarned": number (between 50 and 200)
    }
    
    Conversation:
    ${conversation}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          grammar: { type: Type.STRING },
          slangUsage: { type: Type.STRING },
          culturalAccuracy: { type: Type.STRING },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          pointsEarned: { type: Type.NUMBER }
        },
        required: ["grammar", "slangUsage", "culturalAccuracy", "suggestions", "pointsEarned"]
      }
    }
  });

  return JSON.parse(response.text);
}

export const getLiveSession = (dialect: Dialect, tutor: Tutor, accent: Accent, callbacks: any) => {
  return ai.live.connect({
    model: "gemini-2.5-flash-native-audio-preview-12-2025",
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: tutor.voice } },
      },
      systemInstruction: `You are ${tutor.name}, a local language tutor for the ${dialect.name} dialect. 
      Persona: ${tutor.personality}
      Accent: ${accent.name}
      Speak naturally and use local slang. Keep turns short.`,
    },
  });
};
