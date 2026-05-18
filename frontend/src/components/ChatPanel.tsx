import { useState, useRef, useEffect } from "react";
import { Bot, X, Send } from "lucide-react";
import type { PersonnelRecord } from "@/components/CsvUploader";
import type { IntelItem } from "@/lib/intel-service";

// ── Groq config ────────────────────────────────────────────────────────────
const GROQ_KEY  = (import.meta as any).env?.VITE_GROQ_API_KEY as string | undefined;
const CHAT_MODEL = 'llama-3.3-70b-versatile'; // Best conversational reasoning on Groq

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    assets?: PersonnelRecord[];
    intel?: IntelItem[];
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

// Detect if a response contains risk/alert keywords for block styling
function hasRiskContent(text: string): boolean {
    return /\b(critical|urgent|alert|threat|attack|breach|warning|caution|emergency|hostile|active)\b/i.test(text);
}

const SUGGESTION_CHIPS = [
    'Brief me on top 3 threats',
    'Correlate with historical data',
    'Generate ORBAT for active AOR',
    'Risk score for next 24h',
];

export default function ChatPanel({ isOpen, onClose, assets = [], intel = [] }: ChatPanelProps) {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: "VARUNA.AI COPILOT INITIALIZED.\nAwaiting tactical query — active conflicts, feed data, asset status, or area briefings.",
        },
    ]);
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current)
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;

        const userMsg = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsTyping(true);

        try {
            if (!GROQ_KEY) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: '[CRITICAL ERROR] VITE_GROQ_API_KEY not set in .env.local. Copilot offline.',
                }]);
                return;
            }

            // Build context strings
            const countryCounts: Record<string, number> = {};
            assets.forEach(a => {
                const c = (a.country || 'UNKNOWN').toUpperCase().trim();
                countryCounts[c] = (countryCounts[c] || 0) + 1;
            });

            const assetStats = Object.keys(countryCounts).length > 0
                ? Object.entries(countryCounts).map(([c, n]) => `${n} personnel in ${c}`).join('; ')
                : '0 personnel total';

            const assetsContext = assets.length > 0
                ? `${assets.length} total. Breakdown: ${assetStats}. Raw: ${JSON.stringify(assets.map(a => ({ name: a.name, country: (a.country || 'UNKNOWN').toUpperCase().trim() })))}`
                : 'No personnel tracked. Exactly 0 assets.';

            const intelContext = intel.length > 0
                ? JSON.stringify(intel.slice(0, 6).map(i => ({ headline: i.headline, location: i.source })))
                : 'No live intel available.';

            const systemPrompt =
                `You are VARUNA.AI, a classified Indian OSINT military intelligence assistant.\n` +
                `Respond concisely, tactically, and analytically in military prose.\n\n` +
                `CRITICAL RULES:\n` +
                `1. DO NOT hallucinate or guess numbers.\n` +
                `2. Personnel queries → read ONLY <ACTIVE_ASSETS>.\n` +
                `3. Current events → read ONLY <LIVE_OSINT_FEED>.\n` +
                `4. Handle typos intelligently (e.g. "ndia"→INDIA, "pakstan"→PAKISTAN).\n` +
                `5. Never confuse personnel assets with OSINT feeds.\n\n` +
                `<ACTIVE_ASSETS>\n${assetsContext}\n</ACTIVE_ASSETS>\n\n` +
                `<LIVE_OSINT_FEED>\n${intelContext}\n</LIVE_OSINT_FEED>\n\n` +
                `Answer ONLY from this data. Max 250 words.`;

            // Full conversation history for Groq
            const groqMessages = [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: userMsg },
            ];

            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_KEY}`,
                },
                body: JSON.stringify({
                    model: CHAT_MODEL,
                    messages: groqMessages,
                    max_tokens: 400,
                    temperature: 0.3,
                }),
                signal: AbortSignal.timeout(20_000),
            });

            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(`Groq ${resp.status}: ${err}`);
            }

            const data = await resp.json();
            const reply = data.choices?.[0]?.message?.content ?? '[TRANSMISSION ERROR] No intel received.';
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err: any) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `[CONNECTION ERROR] Comms array failed: ${err?.message ?? String(err)}`,
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed right-6 w-[400px] flex flex-col z-50 overflow-hidden"
            style={{
                bottom: 'calc(var(--bottom-h) + 12px)',
                height: '70vh',
                maxHeight: 640,
                background: 'var(--bg-mid)',
                border: '1px solid var(--signal)',
                boxShadow: '0 0 40px rgba(0,240,255,0.08), 0 8px 32px rgba(0,0,0,0.8)',
            }}
        >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div
                className="flex items-center justify-between px-4 flex-shrink-0"
                style={{
                    height: 44,
                    borderBottom: '1px solid rgba(207,201,194,0.20)',
                    background: 'var(--bg-dark)',
                }}
            >
                <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, color: 'var(--signal)' }}>◈</span>
                    <span
                        className="font-mono font-bold"
                        style={{ fontSize: 11, color: 'var(--signal)', letterSpacing: '0.14em' }}
                    >
                        VARUNA.AI TACTICAL COPILOT
                    </span>
                    {/* Live connectivity dot */}
                    <div
                        className="pulse-dot"
                        style={{ width: 6, height: 6, background: '#7FB069', boxShadow: '0 0 6px #7FB069', marginLeft: 4 }}
                    />
                </div>
                <button onClick={onClose} style={{ color: 'rgba(207,201,194,0.50)' }} className="hover:text-white transition-colors">
                    <X size={16} />
                </button>
            </div>

            {/* ── Messages ───────────────────────────────────────────── */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 p-4"
                style={{ background: 'var(--bg-mid)' }}
            >
                {messages.map((m, i) => (
                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {/* Terminal-style role tag */}
                        <div
                            className="font-mono mb-1"
                            style={{
                                fontSize: 9,
                                letterSpacing: '0.18em',
                                color: m.role === 'user' ? 'rgba(207,201,194,0.50)' : '#7FB069',
                            }}
                        >
                            {m.role === 'user' ? '[OPERATOR]' : '[COPILOT]'}
                        </div>

                        {/* Message bubble */}
                        <div
                            className="max-w-[88%] px-3 py-2.5 font-mono leading-relaxed"
                            style={{
                                fontSize: 12,
                                letterSpacing: '0.02em',
                                ...(m.role === 'user'
                                    ? {
                                        background: 'rgba(207,201,194,0.10)',
                                        border: '1px solid rgba(207,201,194,0.25)',
                                        color: '#fff',
                                    }
                                    : hasRiskContent(m.content)
                                    ? {
                                        // Risk block card — red border + tinted background
                                        background: 'rgba(255,87,87,0.06)',
                                        border: '1px solid rgba(255,87,87,0.30)',
                                        borderLeft: '3px solid #FF5757',
                                        color: '#cfc9c2',
                                    }
                                    : {
                                        background: 'var(--bg-dark)',
                                        border: '1px solid rgba(207,201,194,0.20)',
                                        color: '#cfc9c2',
                                    }
                                ),
                            }}
                        >
                            {m.content}
                        </div>
                    </div>
                ))}

                {/* Three-dot thought animation */}
                {isTyping && (
                    <div className="flex flex-col items-start">
                        <div className="font-mono mb-1" style={{ fontSize: 9, letterSpacing: '0.18em', color: '#7FB069' }}>
                            [COPILOT]
                        </div>
                        <div
                            className="px-4 py-3 flex items-center gap-2"
                            style={{
                                background: 'var(--bg-dark)',
                                border: '1px solid rgba(207,201,194,0.20)',
                            }}
                        >
                            {[0, 1, 2].map(idx => (
                                <div
                                    key={idx}
                                    style={{
                                        width: 6, height: 6,
                                        background: 'var(--signal)',
                                        borderRadius: '50%',
                                        animation: `alert-pulse 1.2s ease-in-out ${idx * 0.2}s infinite`,
                                    }}
                                />
                            ))}
                            <span
                                className="font-mono ml-1"
                                style={{ fontSize: 9, color: 'rgba(207,201,194,0.45)', letterSpacing: '0.12em' }}
                            >
                                ANALYZING
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Suggestion chips ───────────────────────────────────── */}
            <div
                className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1 flex-shrink-0"
                style={{ borderTop: '1px solid rgba(207,201,194,0.12)', background: 'var(--bg-dark)' }}
            >
                {SUGGESTION_CHIPS.map(chip => (
                    <button
                        key={chip}
                        onClick={() => setInput(chip)}
                        className="font-mono text-[9px] px-2 py-1 transition-colors"
                        style={{
                            background: 'rgba(0,240,255,0.06)',
                            border: '1px solid rgba(0,240,255,0.18)',
                            color: 'rgba(0,240,255,0.55)',
                            letterSpacing: '0.04em',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,240,255,0.45)';
                            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,240,255,0.90)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,240,255,0.18)';
                            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,240,255,0.55)';
                        }}
                    >
                        {chip}
                    </button>
                ))}
            </div>

            {/* ── Input ──────────────────────────────────────────────── */}
            <div
                className="flex gap-2 p-3 flex-shrink-0"
                style={{
                    borderTop: '1px solid rgba(207,201,194,0.18)',
                    background: 'var(--bg-dark)',
                }}
            >
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="ENTER QUERY..."
                    className="flex-1 bg-black/40 px-3 py-2 font-mono text-sm focus:outline-none"
                    style={{
                        border: '1px solid rgba(207,201,194,0.18)',
                        color: '#fff',
                        fontSize: 12,
                        letterSpacing: '0.03em',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(0,240,255,0.45)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(207,201,194,0.18)')}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="px-4 flex items-center justify-center transition-opacity disabled:opacity-30"
                    style={{
                        background: 'var(--signal)',
                        color: 'var(--bg-dark)',
                    }}
                >
                    <Send size={15} />
                </button>
            </div>
        </div>
    );
}
