import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";
dotenv.config();

const hf = new HfInference(process.env.VITE_HF_TOKEN || "");

async function test() {
    try {
        console.log("Testing HF Inference...");
        const res = await hf.chatCompletion({
            model: "meta-llama/Llama-3.2-3B-Instruct",
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 50
        });
        console.log("Response:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
