/* Single timed report generation to measure where the pipeline hangs.
   Run: node scripts/timed-report.mjs */
const BASE = "http://localhost:3000"
const suffix = Date.now().toString(36)

async function main() {
    // login as a fresh user
    let res = await fetch(BASE + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: `t_${suffix}`, email: `t_${suffix}@example.com`, password: "TestPass123" })
    })
    const cookie = (res.headers.getSetCookie() || []).find(c => c.startsWith("token="))?.split(";")[ 0 ] || ""
    console.log("registered:", res.status)

    const fd = new FormData()
    fd.append("jobDescription", "Frontend React engineer, TypeScript, REST APIs.")
    fd.append("selfDescription", "Developer with 5 years of React experience and testing knowledge.")

    const t0 = Date.now()
    res = await fetch(BASE + "/api/interview/", {
        method: "POST",
        headers: { Cookie: cookie },
        body: fd
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(1)

    const text = await res.text()
    let short = text
    try {
        const j = JSON.parse(text)
        const r = j.interviewReport
        short = r
            ? `HTTP ${res.status} | id=${r._id} | score=${r.matchScore} | tech=${r.technicalQuestions?.length} behav=${r.behavioralQuestions?.length} gaps=${r.skillGaps?.length} plan=${r.preparationPlan?.length} title="${r.title}"`
            : text
    } catch { /* raw */ }

    console.log(`report generation took ${dt}s`)
    console.log(short && String(short).slice(0, 600))
}

main().catch(e => { console.error("crashed:", e); process.exit(1) })
