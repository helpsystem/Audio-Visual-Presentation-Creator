import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import PptxGenJS from 'pptxgenjs';
import { WordTimestamp, SlideContent } from './types';
import { fileToBase64 } from './utils/file';
import Conversation from './components/Conversation';

// --- Helper Components ---
const Loader = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center space-y-2">
    <svg className="animate-spin h-8 w-8 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <p className="text-purple-300">{text}</p>
  </div>
);

const ErrorDisplay = ({ message }: { message: string }) => (
  <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
    <strong className="font-bold">Error: </strong>
    <span className="block sm:inline">{message}</span>
  </div>
);

interface TimedSlideContent extends SlideContent {
  startTime: number;
}

type AppMode = 'presentation' | 'conversation';

// --- Main App Component ---
const App: React.FC = () => {
  // --- App State ---
  const [mode, setMode] = useState<AppMode>('presentation');

  // --- Presentation Creator State ---
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [persianText, setPersianText] = useState<string | null>('');
  const [timedText, setTimedText] = useState<WordTimestamp[]>([]);
  const [chords, setChords] = useState<string | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  
  const getAi = useCallback(() => {
    if (!process.env.API_KEY) throw new Error("API_KEY environment variable is not set.");
    if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return aiRef.current;
  }, []);

  // --- Presentation Creator Callbacks ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setTimedText([]);
      setCurrentWordIndex(-1);
      setInputText('');
      setPersianText(null);
      setChords(null);
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current || timedText.length === 0) return;
    const currentTime = audioRef.current.currentTime;
    const activeIndex = timedText.findIndex(
      (word) => currentTime >= word.startTime && currentTime <= word.endTime
    );
    setCurrentWordIndex(activeIndex);
  };
  
  const handleTranscribe = useCallback(async () => {
      if (!audioFile) {
        setError('Please upload an audio file first.');
        return;
      }
      setIsLoading('Transcribing audio...');
      setError(null);
      setChords(null);

      try {
        const ai = getAi();
        const audioBase64 = await fileToBase64(audioFile);
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: {
            parts: [
              { inlineData: { mimeType: audioFile.type, data: audioBase64 } },
              { text: "Transcribe the audio. Respond only with the transcribed text." },
            ],
          },
        });
        
        setInputText(response.text);

      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : 'An unknown error occurred during transcription.');
      } finally {
        setIsLoading(null);
      }
  }, [audioFile, getAi]);

  const handleTranslateToPersian = useCallback(async () => {
    if (!inputText) {
      setError('Please provide the Finglish transcript first.');
      return;
    }
    setIsLoading('Translating to Persian...');
    setError(null);
    try {
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Translate the following Finglish (Persian written in Latin script) text into proper Persian script. Maintain the exact line breaks. Do not add any extra explanations or text, only provide the direct translation.\n\nFinglish Text:\n"""\n${inputText}\n"""`,
      });
      setPersianText(response.text);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred during translation.');
    } finally {
      setIsLoading(null);
    }
  }, [inputText, getAi]);

  const handleTransliterateToFinglish = useCallback(async () => {
    if (!persianText) {
      setError('Please provide the Persian transcript first.');
      return;
    }
    setIsLoading('Transliterating to Finglish...');
    setError(null);
    try {
      const ai = getAi();
      const systemInstruction = `You are a professional Persian phonetic transliteration system specialized in converting Farsi (Persian) text into accurate **Finglish** (Latin script Persian).
Your goal is to take any Persian lyrics or Bible text and produce a readable phonetic version that matches how Persian words are pronounced.

Context:
- Application: Worship song lyrics and Bible verses
- Use case: For non-Persian speakers to read and sing Persian lyrics correctly
- Style: Keep natural Persian pronunciation, not English accent
- Rules: preserve rhythm and syllables close to spoken Farsi

---

🔤 Rules for Transliteration:
1. Preserve capitalization for divine names (e.g., "Khoda", "Masiih").
2. Use long vowels as:
   - ا → "a"
   - آ → "aa"
   - ای / ی → "i"
   - او / و → "oo"
   - اُ / ُ → "o"
   - اِ / ِ → "e"
3. Keep voiced consonants close to Persian sounds:
   - ق / غ → "gh"
   - خ → "kh"
   - چ → "ch"
   - ژ → "zh"
   - ش → "sh"
   - ث / س / ص → "s"
   - ذ / ز / ض → "z"
   - ط / ت → "t"
   - ظ → "z"
   - ح / ه → "h"
   - ع (silent between vowels) → use ‘ (apostrophe)
4. Maintain word spacing and punctuation identical to original Persian line.
5. If a line repeats, keep the repetition (do not merge).

---

📘 Example Input:
ال شدای، ال شدای
نام تو در بین ما

📗 Example Finglish Output:
El Shaday, El Shaday
Naam-e to dar beyn-e maa

---

🎧 Instructions:
- Keep rhythm natural for singing.
- Avoid overly academic transliteration; focus on readable, singable Finglish.
- Preserve any repetition, punctuation, commas, and rhythm marks.
- **CRITICAL**: Your entire response should consist ONLY of the Finglish transliteration. Do not include the original Persian text, any explanations, or any other text. Maintain the same number of lines as the input.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: persianText,
        config: {
          systemInstruction: systemInstruction,
        },
      });
      setInputText(response.text);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred during transliteration.');
    } finally {
      setIsLoading(null);
    }
  }, [persianText, getAi]);


  const handleSynchronize = useCallback(async () => {
    if (!audioFile || !inputText) {
      setError('Please provide both an audio file and the corresponding text.');
      return;
    }
    setIsLoading('Analyzing audio and text for synchronization...');
    setError(null);

    try {
      const ai = getAi();
      const audioBase64 = await fileToBase64(audioFile);
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: {
          parts: [
            { inlineData: { mimeType: audioFile.type, data: audioBase64 } },
            { text: `Reference text: "${inputText}"` },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
              },
              required: ['word', 'startTime', 'endTime'],
            },
          },
          systemInstruction: "You are an expert audio transcription service. Analyze the audio against the reference text and provide precise word-level timestamps. Your output MUST be a valid JSON array of objects, where each object represents a word with 'word', 'startTime', and 'endTime' keys. Do not output anything else.",
        }
      });

      const parsedText = JSON.parse(response.text);
      setTimedText(parsedText);

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred during synchronization.');
    } finally {
      setIsLoading(null);
    }
  }, [audioFile, inputText, getAi]);
  
  const handleDetectChords = useCallback(async () => {
      if (!inputText) {
          setError('Please provide text to detect chords from.');
          return;
      }
      setIsLoading('Suggesting musical chords...');
      setError(null);
      
      try {
          const ai = getAi();
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `Based on the following lyrics, provide a simple chord progression for an amateur musician. Only output the chords and their placement above the lyrics. Lyrics: "${inputText}"`,
              systemInstruction: "You are a helpful music assistant. You generate simple chord progressions for song lyrics."
          });
          
          setChords(response.text);

      } catch (e) {
          console.error(e);
          setError(e instanceof Error ? e.message : 'An unknown error occurred during chord detection.');
      } finally {
          setIsLoading(null);
      }
  }, [inputText, getAi]);


  const handleGeneratePresentation = useCallback(async () => {
    if (timedText.length === 0 || !audioRef.current || !persianText || !inputText) {
      setError('Please provide Finglish & Persian text and synchronize the audio first.');
      return;
    }
    setIsLoading('Generating presentation structure...');
    setError(null);

    try {
      const ai = getAi();
      // 1. Generate slide content structure with timings
      const structureResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Here is a transcript with word-level timestamps: ${JSON.stringify(timedText)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slides: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.ARRAY, items: { type: Type.STRING } },
                    startTime: { type: Type.NUMBER },
                  },
                  required: ['title', 'content', 'startTime'],
                },
              },
            },
            required: ['slides'],
          },
          systemInstruction: "You are an expert presentation designer. Based on the provided timed transcript (a JSON array of words with start and end times), structure a presentation. Your output MUST be a valid JSON object with a 'slides' key. The value should be an array of slide objects. Each slide object must contain: a 'title' (string), 'content' (an array of strings for bullet points), and a 'startTime' (a number, which is the startTime of the first word on that slide).",
        },
      });
      const presentationContent: { slides: TimedSlideContent[] } = JSON.parse(structureResponse.text);
      const slidesWithTiming = presentationContent.slides;
      const totalDuration = audioRef.current.duration;
      
      const allFinglishLines = inputText.split('\n');
      const allPersianLines = persianText.split('\n');

      // 2. Generate an image for each slide
      setIsLoading(`Generating images for ${slidesWithTiming.length} slides...`);
      const imagePromises = slidesWithTiming.map(slideData => {
        const imagePrompt = `An inspiring, artistic image for a presentation slide about Christianity. The slide is titled "${slideData.title}" and discusses "${slideData.content.join(', ')}". Style: Digital painting, serene, hopeful. CRITICAL: The generated image must not contain any words, letters, or text of any kind.`;
        return ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: imagePrompt }] },
          config: { responseModalities: [Modality.IMAGE] },
        });
      });

      const imageResponses = await Promise.all(imagePromises);
      const slideImagesBase64 = imageResponses.map(response => {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return part.inlineData.data;
          }
        }
        return undefined;
      });

      // 3. Create PPTX
      setIsLoading('Assembling PowerPoint file...');
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      // 4. Create slides with images, text, and timed transitions
      slidesWithTiming.forEach((slideData, index) => {
        const slide = pres.addSlide();
        const imageBase64 = slideImagesBase64[index];

        if (imageBase64) {
          slide.background = { data: `data:image/png;base64,${imageBase64}` };
        } else {
          slide.background = { color: '1F2937' }; // Fallback
        }
        
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: '100%', h: '100%',
          fill: { color: '000000', transparency: 50 },
        });

        slide.addText(slideData.title, {
          x: 0.5, y: 0.5, w: '90%', h: 1,
          align: 'center', fontSize: 36, color: 'FFFFFF', bold: true, fontFace: 'Calibri',
          shadow: { type: 'outer', color: '000000', blur: 3, offset: 2, angle: 45, opacity: 0.8 },
        });

        const persianContentForSlide: string[] = [];
        slideData.content.forEach(finglishLine => {
            const lineIndex = allFinglishLines.findIndex(line => line.trim() === finglishLine.trim());
            if (lineIndex !== -1 && lineIndex < allPersianLines.length) {
                persianContentForSlide.push(allPersianLines[lineIndex]);
            }
        });

        // Add Finglish text box (Left)
        slide.addText(slideData.content.join('\n'), {
          x: 0.5, y: 1.8, w: '44%', h: 4.5,
          align: 'left', fontSize: 20, bullet: true, color: 'E5E7EB', fontFace: 'Calibri',
          shadow: { type: 'outer', color: '000000', blur: 2, offset: 1, angle: 45, opacity: 0.7 },
        });

        // Add Persian text box (Right)
        slide.addText(persianContentForSlide.join('\n'), {
          x: 5.1, y: 1.8, w: '44%', h: 4.5,
          align: 'right', rtlMode: true, fontSize: 20, bullet: true, color: 'E5E7EB', fontFace: 'Calibri',
          shadow: { type: 'outer', color: '000000', blur: 2, offset: 1, angle: 45, opacity: 0.7 },
        });
        
        // Calculate slide duration for auto-transition
        const nextSlideStartTime = (index + 1 < slidesWithTiming.length) 
            ? slidesWithTiming[index + 1].startTime 
            : totalDuration;
        const durationInSeconds = nextSlideStartTime - slideData.startTime;

        if (durationInSeconds > 0) {
            slide.transition = {
                type: 'fade',
                advTm: Math.round(durationInSeconds * 1000)
            };
        }
      });

      // 5. Embed audio if available
      if (audioFile) {
        const audioBase64 = await fileToBase64(audioFile);
        const audioDataUrl = `data:${audioFile.type};base64,${audioBase64}`;
        
        const firstSlide = pres.getSlide('1');
        if (firstSlide) {
          firstSlide.addMedia({
            type: 'audio',
            data: audioDataUrl,
            x: 0.0, y: 0.0, w: 0.1, h: 0.1,
          });
        }
      }

      pres.writeFile({ fileName: 'presentation.ppsx' });

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred during presentation generation.');
    } finally {
      setIsLoading(null);
    }
  }, [timedText, getAi, audioFile, inputText, persianText]);

  const getTabClassName = (tabMode: AppMode) => {
    return `px-6 py-3 font-medium text-base rounded-t-lg transition-colors focus:outline-none ${
      mode === tabMode
        ? 'bg-gray-800 border-b-2 border-purple-500 text-white'
        : 'border-b-2 border-transparent text-gray-400 hover:bg-gray-700/50 hover:text-white'
    }`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <header className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            AI Content Suite
          </h1>
          <p className="text-gray-400 mt-2">
            Create presentations or have a live conversation with AI.
          </p>
        </header>

        {/* --- Tab Navigation --- */}
        <div className="flex justify-center border-b border-gray-700">
          <button onClick={() => setMode('presentation')} className={getTabClassName('presentation')}>
            Presentation Creator
          </button>
          <button onClick={() => setMode('conversation')} className={getTabClassName('conversation')}>
            Live Conversation
          </button>
        </div>

        {/* --- Conditional Content --- */}
        {mode === 'presentation' && (
          <div className="space-y-8">
            {error && <ErrorDisplay message={error} />}

            {/* --- Step 1: Input --- */}
            <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 space-y-4">
                <h2 className="text-xl font-semibold text-purple-300 border-b border-gray-700 pb-2">Step 1: Provide Your Content</h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="audio-upload" className="block mb-2 text-sm font-medium text-gray-300">Upload Audio File</label>
                        <input id="audio-upload" type="file" accept="audio/*" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 transition-colors"/>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="text-input" className="block mb-2 text-sm font-medium text-gray-300">Audio Transcript (Finglish)</label>
                        <textarea id="text-input" value={inputText} onChange={(e) => setInputText(e.target.value)} rows={6} placeholder="Enter Finglish text, or generate it from Persian." className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-purple-500 focus:border-purple-500"></textarea>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="persian-text" className="block mb-2 text-sm font-medium text-gray-300">Persian Transcript</label>
                        <textarea id="persian-text" value={persianText || ''} onChange={(e) => setPersianText(e.target.value)} rows={6} placeholder="Enter Persian text here, or generate it from Finglish." className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-purple-500 focus:border-purple-500 font-['Tahoma']" style={{direction: 'rtl'}}></textarea>
                    </div>
                </div>
                <div className="flex flex-wrap justify-center items-center gap-4 pt-2">
                    <button onClick={handleTranscribe} disabled={!!isLoading || !audioFile} className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-full transition-opacity">
                        Transcribe Audio
                    </button>
                    <button onClick={handleTranslateToPersian} disabled={!!isLoading || !inputText} className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-full transition-opacity">
                        Finglish → Persian
                    </button>
                    <button onClick={handleTransliterateToFinglish} disabled={!!isLoading || !persianText} className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-full transition-opacity">
                        Persian → Finglish
                    </button>
                    <button onClick={handleSynchronize} disabled={!!isLoading || !audioFile || !inputText} className="bg-gradient-to-r from-green-500 to-teal-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-full transition-opacity">
                        Synchronize Text
                    </button>
                </div>
            </div>
            
            {isLoading && <Loader text={isLoading} />}
            
            {timedText.length > 0 && (
              <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 space-y-4">
                <h2 className="text-xl font-semibold text-purple-300 border-b border-gray-700 pb-2">Step 2: Review & Generate</h2>
                {audioUrl && <audio ref={audioRef} src={audioUrl} controls className="w-full" onTimeUpdate={handleTimeUpdate} />}
                <div className="p-4 bg-gray-900/50 rounded-lg max-h-60 overflow-y-auto text-lg leading-relaxed">
                  {timedText.map((word, index) => (
                    <span key={index} className={`transition-colors duration-150 ${index === currentWordIndex ? 'bg-yellow-400 text-gray-900 rounded' : ''}`}>
                      {word.word}{' '}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap justify-center items-center gap-4 pt-2">
                    <button onClick={handleDetectChords} disabled={!!isLoading} className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-full transition-opacity">
                        Detect Chords
                    </button>
                    <button onClick={handleGeneratePresentation} disabled={!!isLoading || timedText.length === 0 || !persianText} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-full transition-opacity">
                        Generate Dual-Language Presentation
                    </button>
                </div>
              </div>
            )}
            
            {chords && (
                <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 space-y-3">
                    <h2 className="text-xl font-semibold text-yellow-300 border-b border-gray-700 pb-2">Musical Chords (Experimental)</h2>
                    <p className="text-sm text-gray-400">Note: These chords are AI-generated based on lyrics and may not be accurate. They are intended as a creative guide.</p>
                    <pre className="p-4 bg-gray-900/50 rounded-lg max-h-80 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap font-mono">{chords}</pre>
                </div>
            )}
          </div>
        )}

        {mode === 'conversation' && (
          <div className="bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <Conversation />
          </div>
        )}
        
        <footer className="text-center mt-8 text-gray-500 text-sm">
          <p>Powered by the Gemini API.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;