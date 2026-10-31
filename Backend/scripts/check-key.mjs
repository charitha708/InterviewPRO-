/* Quick key validation: tries the key against the Gemini REST API
   with both accepted header styles. Prints only statuses and model names. */

const KEY = process.argv[2]
const BASE = "https://generativelanguage.googleapis.com/v1beta"

async function attempt(label, headers) {
    const res = await fetch(`${BASE}/models`, {
        headers: { ...headers }
    })
    const body = await res.json().catch(() => null)
    if (res.ok && body?.models) {
        const ids = body.models.map(m => m.name.replace("models/", ""))
        console.log(`${label}: OK (${ids.length} models visible)`)
        return ids
    }
    console.log(`${label}: HTTP ${res.status}`, JSON.stringify(body?.error?.message || body).slice(0, 300))
    return null
}

async function main() {
    const byHeader = await attempt("x-goog-api-key", { "x-goog-api-key": KEY })
    if (byHeader) { console.log("LIST:", byHeader.join(", ")); return }
    const byBearer = await attempt("Authorization Bearer", { Authorization: `Bearer ${KEY}` })
    if (byBearer) { console.log("LIST:", byBearer.join(", ")); return }
    console.log("KEY_INVALID under both header styles")
}

main()
