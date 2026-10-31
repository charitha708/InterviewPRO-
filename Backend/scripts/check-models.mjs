/* Minimal raw REST generateContent checks against candidate models. */
const KEY = process.argv[2]
const BASE = "https://generativelanguage.googleapis.com/v1beta"

const models = [
    "gemini-3.7-flash",          // current report model
    "gemini-3-flash-preview",    // current resume model
    "gemini-3.5-flash",
    "gemini-2.5-flash"
]

async function main() {
    for (const model of models) {
        const t0 = Date.now()
        try {
            const res = await fetch(
                `${BASE}/models/${model}:generateContent`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: "Reply with the single word: pong" }] }]
                    })
                }
            )
            const dt = ((Date.now() - t0) / 1000).toFixed(1)
            const body = await res.json().catch(() => null)
            if (res.ok) {
                const text = body?.candidates?.[ 0 ]?.content?.parts?.[ 0 ]?.text
                console.log(`${model}: HTTP ${res.ok ? 200 : res.status} in ${dt}s -> "${String(text).trim().slice(0, 40)}"`)
            } else {
                console.log(`${model}: HTTP ${res.status} in ${dt}s ->`, JSON.stringify(body?.error?.status || body?.error?.message || body).slice(0, 200))
            }
        } catch (err) {
            const dt = ((Date.now() - t0) / 1000).toFixed(1)
            console.log(`${model}: FAILED after ${dt}s ->`, err?.cause?.code || err?.code || err?.message)
        }
    }
}

main()
