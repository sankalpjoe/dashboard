import { useState, useRef, useEffect } from "react";
import { HfInference } from "@huggingface/inference";
import { Bot, X, Send } from "lucide-react";
import type { PersonnelRecord } from "@/components/CsvUploader";
import type { IntelItem } from "@/lib/intel-service";

// Initialize the HF client. We fall back to a public model if no token is available, though it might hit rate limits.
const hfToken = import.meta.env.VITE_HF_TOKEN || "";
const hf = new HfInference(hfToken);
const MODEL = "Qwen/Qwen2.5-72B-Instruct"; // Heavy, powerful model for exact RAG extraction

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    assets?: PersonnelRecord[];
    intel?: IntelItem[];
}

export default function ChatPanel({ isOpen, onClose, assets = [], intel = [] }: ChatPanelProps) {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: "VARUNA.AI COPILOT INITIALIZED. Awaiting tactical query regarding active conflicts, feed data, or area briefings." }
    ]);
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsTyping(true);

        try {
            // Aggregate assets by country for the LLM to prevent hallucination of numbers
            const countryCounts: Record<string, number> = {};
            assets.forEach(a => {
                const c = (a.country || 'UNKNOWN').toUpperCase().trim();
                countryCounts[c] = (countryCounts[c] || 0) + 1;
            });

            const assetStats = Object.keys(countryCounts).length > 0
                ? Object.entries(countryCounts).map(([c, count]) => `${count} personnel in ${c}`).join("; ")
                : "0 personnel total";

            // Serialize local databases for context injection
            const assetsContext = assets.length > 0
                ? `Total ${assets.length} personnel tracking. Breakdown: ${assetStats}. Raw list: ${JSON.stringify(assets.map(a => ({ name: a.name, country: (a.country || 'UNKNOWN').toUpperCase().trim() })))}`
                : "No personnel tracked. Exactly 0 assets.";

            const intelContext = intel.length > 0
                ? `JSON format: ${JSON.stringify(intel.slice(0, 5).map(i => ({ headline: i.headline, location: i.source })))}`
                : "No live intel available.";

            // Create chat history
            const formattedMessages = [
                {
                    role: 'system', content: `You are VARUNA.AI, a highly classified Indian OSINT military intelligence dashboard. Keep responses extremely concise, tactical, and analytical. Use military terminology. 
                
CRITICAL RULES:
1. DO NOT hallucinate or guess numbers.
2. If the user asks how many assets/personnel/people are in a country, YOU MUST read ONLY the <ACTIVE_ASSETS> block.
3. If the country is not listed in the <ACTIVE_ASSETS> block, the answer is EXACTLY ZERO.
4. Be smart with typos (e.g. "ndia" is "INDIA", "usa" is "USA", "spainn" is "SPAIN"). Match to the closest country in the list.
5. Base current events exclusively on the <LIVE_OSINT_FEED> block. Do not invent news.
6. NEVER confuse personnel assets and OSINT feeds. They are two totally separate systems.
7. If asked about pipelines or data centers, refer to the user's latest context or state that the OSINT feed is monitoring them.

<ACTIVE_ASSETS>
${assetsContext}
</ACTIVE_ASSETS>

<LIVE_OSINT_FEED>
${intelContext}
</LIVE_OSINT_FEED>

Answer the user directly based ONLY on this exact data.`
                }, ...messages.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userMsg }
            ];

            const response = await hf.chatCompletion({
                model: MODEL,
                // @ts-ignore - messages shape is correctly matching HF API standard format
                messages: formattedMessages,
                max_tokens: 350,
                temperature: 0.3,
            });

            const reply = response.choices[0]?.message?.content || "TRANSMISSION ERROR: No intel received.";
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err: any) {
            const msg = err?.message || String(err);
            if (msg.includes("Authorization") || msg.includes("non-Hugging Face API key") || msg.includes("Token is required")) {
                setMessages(prev => [...prev, { role: 'assistant', content: `[CRITICAL ERROR] Unauthorized access. The HuggingFace Inference API requires a valid token for the Llama-3 model. Please set VITE_HF_TOKEN in your .env file and restart the dashboard.` }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: `[CONNECTION ERROR] Communications array failed: ${msg}` }]);
            }
        } finally {
            setIsTyping(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-12 right-6 w-96 max-h-[600px] h-[70vh] bg-bg-mid border border-signal shadow-2xl flex flex-col z-50 overflow-hidden transform transition-all duration-300">
            {/* Header */}
            <div className="h-10 border-b border-signal/30 flex items-center justify-between px-3 bg-bg-dark">
                <div className="flex items-center gap-2">
                    <Bot size={16} className="text-signal" />
                    <span className="mono-label-lg text-signal">VARUNA.AI TACTICAL COPILOT</span>
                </div>
                <button onClick={onClose} className="text-text-light hover:text-white transition-colors">
                    <X size={18} />
                </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 font-mono text-sm bg-bg-dark/50" ref={scrollRef}>
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 text-[13px] tracking-wide leading-relaxed ${m.role === 'user' ? 'bg-signal/20 border border-signal/30 text-white' : 'bg-bg-dark border border-signal text-signal font-medium'}`}>
                            {m.role === 'assistant' && <div className="text-[10px] text-white mb-1.5 opacity-80 font-bold">▶ SYSTEM RESPONSE</div>}
                            {m.content}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-bg-dark border border-signal/50 text-signal/80 p-3 text-xs w-28 flex items-center gap-2">
                            <span className="animate-pulse">ANALYZING</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-signal/30 bg-bg-dark flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    className="flex-1 bg-black/50 border border-border-light px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-signal/50 placeholder:text-text-light/30 tracking-tight"
                    placeholder="ENTER QUERY..."
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="bg-signal text-bg-dark px-3 flex items-center justify-center font-bold mono-label disabled:opacity-30 transition-opacity hover:bg-opacity-90"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
