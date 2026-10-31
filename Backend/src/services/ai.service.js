const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

/*
    Model selection: these IDs were verified against the live API with a
    minimal generateContent call (see scripts/check-models.mjs).
    A single fixed model proved unreliable (gemini-3.7-flash -> 503
    UNAVAILABLE), so generation falls back through a list of available
    models until one responds.
*/
const REPORT_MODELS = [
    "gemini-flash-latest",       // rolling alias to the latest stable flash model
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
]
const RESUME_MODELS = [
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-3.5-flash"
]


/**
 * @description Convert Gemini API failures (invalid key, quota exhausted,
 * outage) into friendly errors the API can surface to the user.
 */
function toFriendlyAiError(err) {
    const msg = String(err?.message || "")
    const status = err?.status
    const causeCode = err?.cause?.code || ""
    const causeName = err?.cause?.name || ""

    // Call aborted by our own attempt timeout, or killed by undici's headers
    // timeout: Google accepted the request but never answered in time.
    if (err?.name === "AbortError" || causeName === "TimeoutError" ||
        causeCode === "UND_ERR_HEADERS_TIMEOUT") {
        const friendly = new Error(
            "The AI service took too long to respond. Please try again."
        )
        friendly.status = 503
        return friendly
    }

    // Daily / per-minute limits exceeded (free tier: RESOURCE_EXHAUSTED).
    if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        const friendly = new Error(
            "The AI service reached its usage limit. Please try again later (free-tier limits reset daily)."
        )
        friendly.status = 429
        return friendly
    }

    // Invalid / revoked API key or permission denied.
    if (status === 401 || status === 403 ||
        /API key not valid|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) {
        const friendly = new Error(
            "The AI service is not configured correctly (invalid API key). Please contact the administrator."
        )
        friendly.status = 503
        return friendly
    }

    // Google-side outages.
    if (status >= 500) {
        const friendly = new Error("The AI service is temporarily unavailable. Please try again.")
        friendly.status = 503
        return friendly
    }

    return null
}

/* Small delay helper used between retries. */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


/**
 * @description Try a list of models in order; a call on model A can hit a
 * "high demand" 503 while model B answers immediately. Falls back through
 * REPORT_MODELS/RESUME_MODELS and throws the friendliest error found.
 */
async function callGeminiWithFallbacks({ models, params }) {
    let lastError = null
    let lastFriendly = null

    for (const model of models) {
        try {
            return await callGemini({ ...params, model })
        } catch (err) {
            lastError = err
            if (err.status) {
                lastFriendly = err
            }
            console.error(`Model ${model} did not respond, trying the next one...`)
        }
    }

    throw lastFriendly || lastError
}


/**
 * @description Wrapper around ai.models.generateContent that throws
 * friendly errors for known failure modes and retries transient
 * 503 "high demand" answers once per model. Every attempt is bounded
 * by a 30s abort signal so a hung request cannot stall the fallback
 * chain for minutes.
 */
async function callGemini(params) {
    const maxAttempts = 2
    // 20s per attempt keeps the whole fallback cycle within typical
    // hosting platform request timeouts (~100s on Render).
    const attemptTimeoutMs = 20 * 1000

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await ai.models.generateContent({
                ...params,
                config: {
                    ...params.config,
                    abortSignal: AbortSignal.timeout(attemptTimeoutMs)
                }
            })
        } catch (err) {
            // Log the full raw error for diagnosis, then retry or move on.
            console.error(`Gemini API call failed (attempt ${attempt}/${maxAttempts}):`, err);

            const aborted = err?.name === "AbortError" ||
                err?.cause?.name === "TimeoutError" ||
                err?.cause?.code === "UND_ERR_HEADERS_TIMEOUT"

            if (aborted) {
                // A hung request will not recover by retrying the same
                // model - let the fallback chain try another one.
                const friendly = toFriendlyAiError(err)
                throw friendly || err
            }

            const transient = err?.status === 503 || /UNAVAILABLE/i.test(String(err?.message || ""))
            if (transient && attempt < maxAttempts) {
                await delay(1500 * attempt)
                continue
            }

            const friendly = toFriendlyAiError(err)
            if (friendly) throw friendly
            throw err
        }
    }
}

/**
 * @description Parse a structured JSON answer from the AI, with a friendly
 * error when the response is not the expected JSON.
 */
function parseAiJson(text) {
    try {
        return JSON.parse(text)
    } catch {
        const friendly = new Error("The AI returned an unexpected response. Please try again.")
        friendly.status = 502
        throw friendly
    }
}


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum([ "low", "medium", "high" ]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {


    const prompt = `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}
`

    const response = await callGeminiWithFallbacks({
        models: REPORT_MODELS,
        params: {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(interviewReportSchema),
            }
        }
    })

    return parseAiJson(response.text)


}



async function generatePdfFromHtml(htmlContent) {
    // Sandbox flags are required when running inside Linux containers
    // (e.g. Render) as root; they are harmless on local dev machines.
    const browser = await puppeteer.launch({
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    })
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" })

    const pdfBuffer = await page.pdf({
        format: "A4", margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    })

    await browser.close()

    return pdfBuffer
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const resumePdfSchema = z.object({
        html: z.string().describe("The HTML content of the resume which can be converted to PDF using any library like puppeteer")
    })

    const prompt = `Generate resume for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}

                        the response should be a JSON object with a single field "html" which contains the HTML content of the resume which can be converted to PDF using any library like puppeteer.
                        The resume should be tailored for the given job description and should highlight the candidate's strengths and relevant experience. The HTML content should be well-formatted and structured, making it easy to read and visually appealing.
                        The content of resume should be not sound like it's generated by AI and should be as close as possible to a real human-written resume.
                        you can highlight the content using some colors or different font styles but the overall design should be simple and professional.
                        The content should be ATS friendly, i.e. it should be easily parsable by ATS systems without losing important information.
                        The resume should not be so lengthy, it should ideally be 1-2 pages long when converted to PDF. Focus on quality rather than quantity and make sure to include all the relevant information that can increase the candidate's chances of getting an interview call for the given job description.
                    `

    const response = await callGeminiWithFallbacks({
        models: RESUME_MODELS,
        params: {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(resumePdfSchema),
            }
        }
    })


    const jsonContent = parseAiJson(response.text)

    const pdfBuffer = await generatePdfFromHtml(jsonContent.html)

    return pdfBuffer

}

module.exports = { generateInterviewReport, generateResumePdf }