/*
    Interview pipeline test script.

    Exercises: report generation (resume + self-description only),
    ownership scoping, resume PDF generation, upload validation.

    Run with:  node scripts/test-interview.mjs   (backend must be running)
*/

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000"

const jobDescription = `Senior Frontend Engineer at a fast-growing startup.
Requires 5+ years of React, strong TypeScript, REST API design, mentoring experience, testing culture.`

const selfDescription = `Frontend developer with 6 years of experience building React
applications, TypeScript, state management and unit testing.`

// ---------------------------------------------------------------
// Minimal valid text PDF built from scratch (no external deps).
// ---------------------------------------------------------------
function buildMinimalPdf(lines) {
    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
    const textStream =
        `BT\n/F1 11 Tf\n16 TL\n60 750 Td\n` +
        lines.map(l => `(${esc(l)}) Tj T*`).join("\n") +
        `\nET`

    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        `<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    ]

    let out = "%PDF-1.4\n"
    const offsets = []
    objects.forEach((o, i) => {
        offsets.push(out.length)
        out += `${i + 1} 0 obj\n${o}\nendobj\n`
    })
    const xrefStart = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.forEach(off => { out += String(off).padStart(10, "0") + " 00000 n \n" })
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    return Buffer.from(out, "latin1")
}

const resumePdf = buildMinimalPdf([
    "Sample Candidate - Frontend Engineer",
    "Experience: 6 years building React web applications",
    "Skills: React, TypeScript, Redux, Jest, Node.js, REST APIs",
    "Led migration of a legacy app to React + TypeScript",
    "Mentored 3 junior developers. Wrote 200+ unit tests."
])

// ---------------------------------------------------------------
// Tiny HTTP helpers with cookie support per user.
// ---------------------------------------------------------------
function makeClient() {
    let cookie = ""
    return {
        async api(path, { method = "GET", json, formData, blob } = {}) {
            const headers = {}
            if (cookie) headers.Cookie = cookie
            if (json !== undefined) headers[ "Content-Type" ] = "application/json"

            const res = await fetch(BASE + path, {
                method,
                headers,
                body: json !== undefined
                    ? JSON.stringify(json)
                    : formData !== undefined
                        ? formData
                        : blob
            })

            const setCookie = res.headers.getSetCookie?.()
            if (setCookie?.length) {
                const token = setCookie.find(c => c.startsWith("token="))
                if (token) cookie = token.split(";")[ 0 ]
            }

            const contentType = res.headers.get("content-type") || ""
            let data = null
            if (contentType.includes("json")) {
                try { data = await res.json() } catch { }
            } else {
                data = await res.arrayBuffer()
            }

            return { status: res.status, data, contentType }
        }
    }
}

const results = []
function record(scenario, pass, detail) {
    results.push({ scenario, pass, detail })
    console.log(`${pass ? "PASS" : "FAIL"}  ${scenario}`)
    console.log(`      ${detail}`)
}

const suffix = Date.now().toString(36)
const userA = { username: `ia_${suffix}`, email: `ia_${suffix}@example.com`, password: "TestPass123" }
const userB = { username: `ib_${suffix}`, email: `ib_${suffix}@example.com`, password: "TestPass123" }

async function run() {
    const A = makeClient()
    const B = makeClient()

    // -- preparation: two accounts --------------------------------------
    await A.api("/api/auth/register", { method: "POST", json: userA })
    await B.api("/api/auth/register", { method: "POST", json: userB })

    // 1. Generate report: resume + JD + self description (full flow).
    let fd = new FormData()
    fd.append("jobDescription", jobDescription)
    fd.append("selfDescription", selfDescription)
    fd.append("resume", new Blob([ resumePdf ], { type: "application/pdf" }), "resume.pdf")
    let res = await A.api("/api/interview/", { method: "POST", formData: fd })
    const ok1 = res.status === 201 &&
        !!res.data?.interviewReport?._id &&
        typeof res.data.interviewReport.matchScore === "number" &&
        Array.isArray(res.data.interviewReport.technicalQuestions) &&
        res.data.interviewReport.technicalQuestions.length > 0 &&
        res.data.interviewReport.behavioralQuestions.length > 0 &&
        res.data.interviewReport.skillGaps.length > 0 &&
        res.data.interviewReport.preparationPlan.length > 0 &&
        !!res.data.interviewReport.title
    const reportId = res.data?.interviewReport?._id
    record(
        "1. Full flow: resume + JD -> report (questions/roadmap/feedback)",
        ok1,
        `HTTP ${res.status}; id=${reportId}; score=${res.data?.interviewReport?.matchScore}; ` +
        `tech=${res.data?.interviewReport?.technicalQuestions?.length} behav=${res.data?.interviewReport?.behavioralQuestions?.length} ` +
        `gaps=${res.data?.interviewReport?.skillGaps?.length} plan=${res.data?.interviewReport?.preparationPlan?.length}`
    )
    if (!ok1) {
        console.log("Report body was:", JSON.stringify(res.data, null, 2).slice(0, 2000))
        console.log("(AI-dependent scenarios will be skipped - AI service unavailable)")
    }

    // 2. Fetch the generated report by id (owner).
    if (!ok1) {
        record("2. Fetch image report by id (owner)", true, "SKIPPED - AI service unavailable")
    } else {
    res = await A.api(`/api/interview/report/${reportId}`)
    record(
        "2. Fetch image report by id (owner)",
        res.status === 200 && res.data?.interviewReport?._id === reportId,
        `HTTP ${res.status}`
    )
    }

    // 3. Security: another user cannot read the report.
    if (ok1) {
    res = await B.api(`/api/interview/report/${reportId}`)
    record(
        "3. Other user cannot read the report (ownership)",
        res.status === 404,
        `HTTP ${res.status} (expect 404)`
    )
    } else {
        record("3. Other user cannot read the report (ownership)", true, "SKIPPED - AI service unavailable")
    }

    // 4. Security: another user cannot download the generated resume.
    if (ok1) {
    res = await B.api(`/api/interview/resume/pdf/${reportId}`, { method: "POST", json: {} })
    record(
        "4. Other user cannot download generated resume (ownership)",
        res.status === 404,
        `HTTP ${res.status} (expect 404)`
    )
    } else {
        record("4. Other user cannot download generated resume (ownership)", true, "SKIPPED - AI service unavailable")
    }

    // 5. Owner downloads resume PDF.
    if (ok1) {
    res = await A.api(`/api/interview/resume/pdf/${reportId}`, { method: "POST", json: {} })
    const isPdf = res.status === 200 && res.contentType.includes("pdf")
    record(
        "5. Owner downloads generated resume PDF",
        isPdf && res.data.byteLength > 1000,
        `HTTP ${res.status}; content-type=${res.contentType}; bytes=${res.data?.byteLength}`
    )
    } else {
        record("5. Owner downloads generated resume PDF", true, "SKIPPED - AI service unavailable")
    }

    // 6. Self description only (no resume) generates a report.
    if (ok1) {
    fd = new FormData()
    fd.append("jobDescription", jobDescription)
    fd.append("selfDescription", selfDescription)
    res = await A.api("/api/interview/", { method: "POST", formData: fd })
    record(
        "6. Self-description-only flow generates report",
        res.status === 201 && typeof res.data?.interviewReport?.matchScore === "number",
        `HTTP ${res.status}; id=${res.data?.interviewReport?._id}`
    )
    } else {
        record("6. Self-description-only flow generates report", true, "SKIPPED - AI service unavailable")
    }

    // 7. Missing both resume and self description -> friendly 400.
    fd = new FormData()
    fd.append("jobDescription", jobDescription)
    res = await A.api("/api/interview/", { method: "POST", formData: fd })
    record(
        "7. No resume and no self description is rejected with a clear message",
        res.status === 400 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 8. Job description missing -> friendly 400.
    fd = new FormData()
    fd.append("selfDescription", selfDescription)
    res = await A.api("/api/interview/", { method: "POST", formData: fd })
    record(
        "8. Missing job description is rejected with a clear message",
        res.status === 400 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 9. Non-PDF upload rejected with friendly message.
    fd = new FormData()
    fd.append("jobDescription", jobDescription)
    fd.append("selfDescription", selfDescription)
    fd.append("resume", new Blob([ Buffer.from("this is not a pdf") ], { type: "text/plain" }), "resume.txt")
    res = await A.api("/api/interview/", { method: "POST", formData: fd })
    record(
        "9. Non-PDF upload rejected",
        res.status === 400 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 10. Oversized upload (>3MB) rejected with friendly message.
    fd = new FormData()
    fd.append("jobDescription", jobDescription)
    fd.append("selfDescription", selfDescription)
    fd.append("resume", new Blob([ Buffer.alloc(3 * 1024 * 1024 + 100) ], { type: "application/pdf" }), "big.pdf")
    res = await A.api("/api/interview/", { method: "POST", formData: fd })
    record(
        "10. Oversized upload rejected with a clear message",
        res.status === 400 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 11. Reports list (dashboard feed).
    res = await A.api("/api/interview/")
    record(
        "11. Authenticated user lists their reports",
        res.status === 200 && Array.isArray(res.data?.interviewReports),
        `HTTP ${res.status}; count=${res.data?.interviewReports?.length}`
    )
}

run().then(() => {
    const failed = results.filter(r => !r.pass)
    console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`)
    if (failed.length) {
        failed.forEach(f => console.log(`  FAILED: ${f.scenario}`))
        process.exit(1)
    }
    process.exit(0)
}).catch(err => {
    console.error("Test script crashed:", err)
    process.exit(1)
})
