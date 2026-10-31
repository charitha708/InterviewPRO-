/*
    Authentication API test script.

    Runs the 8 required scenarios against the running backend
    (http://localhost:3000) using the real MongoDB Atlas database.

    Run with:  node scripts/test-auth.mjs
*/

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000"

// Unique suffix so this script can be re-run without touching old data.
const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// ---------------------------------------------------------------
// Register a test user before the scenarios run.
// ---------------------------------------------------------------
const TEST_USER = {
    username: `testuser_${runId}`,
    email: `testuser_${runId}@example.com`,
    password: "TestPass123"
}

let cookie = ""

async function api(path, { method = "GET", body, withAuth = false, headers = {} } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            ...(body !== undefined && { "Content-Type": "application/json" }),
            ...(withAuth && cookie && { Cookie: cookie }),
            ...headers
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    })

    // Capture the session cookie if the server sets one.
    const setCookie = res.headers.getSetCookie?.()
    if (setCookie?.length) {
        const tokenCookie = setCookie.find(c => c.startsWith("token="))
        if (tokenCookie) {
            cookie = tokenCookie.split(";")[ 0 ]
        }
    }

    let data = null
    try { data = await res.json() } catch { /* non-JSON body */ }

    return { status: res.status, data }
}

const results = []
function record(scenario, pass, detail) {
    results.push({ scenario, pass, detail })
    console.log(`${pass ? "PASS" : "FAIL"}  ${scenario}`)
    console.log(`      ${detail}`)
}

// ---------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------
async function run() {

    // 0. Register the test user first (Task 6/1 covered here).
    let res = await api("/api/auth/register", { method: "POST", body: TEST_USER })
    record(
        "1. New user registration",
        res.status === 201 && !!res.data?.user?.id,
        `HTTP ${res.status} - ${res.data?.message || res.data?.error || "-"}`
    )

    if (res.status !== 201) {
        console.log("\nRegistration failed, aborting dependent scenarios.")
        console.log(results)
        process.exit(1)
    }

    // 1. Duplicate email registration.
    res = await api("/api/auth/register", {
        method: "POST",
        body: { ...TEST_USER, username: `other_${runId}` }
    })
    record(
        "2. Duplicate email registration is rejected",
        res.status === 409,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 2. Login with correct credentials.
    res = await api("/api/auth/login", {
        method: "POST",
        body: { email: TEST_USER.email, password: TEST_USER.password }
    })
    record(
        "3. Login with correct credentials",
        res.status === 200 && res.data?.user?.username === TEST_USER.username && !!cookie,
        `HTTP ${res.status} - ${res.data?.message || "-"} | session cookie: ${cookie ? "issued" : "MISSING"}`
    )

    // Sanity: get-me with the issued session.
    res = await api("/api/auth/get-me", { withAuth: true })
    record(
        "3b. Authenticated session works (get-me)",
        res.status === 200 && res.data?.user?.email === TEST_USER.email,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 3. Login with incorrect password.
    res = await api("/api/auth/login", {
        method: "POST",
        body: { email: TEST_USER.email, password: "WrongPassword1" }
    })
    record(
        "4. Login with incorrect password is rejected",
        res.status === 401 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 4. Login with unregistered email.
    res = await api("/api/auth/login", {
        method: "POST",
        body: { email: `nosuchuser_${runId}@example.com`, password: "Whatever123" }
    })
    record(
        "5. Login with unregistered email is rejected",
        res.status === 401 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 5. Access protected route without authentication.
    res = await api("/api/interview/")
    record(
        "6. Dashboard API without authentication is blocked",
        res.status === 401 && !!res.data?.message,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
    )

    // 6. Logout, then verify the session is dead.
    res = await api("/api/auth/logout", { method: "GET", withAuth: true })
    const loggedOut = res.status === 200

    res = await api("/api/auth/get-me", { withAuth: true })
    record(
        "7. Logout ends the session",
        loggedOut && res.status === 401,
        `logout HTTP ${loggedOut ? 200 : "?"}; get-me after logout HTTP ${res.status} (expect 401)`
    )

    // 7. Registering again with the same email must still fail (persistence).
    res = await api("/api/auth/register", { method: "POST", body: TEST_USER })
    record(
        "8b. User persisted in Atlas (duplicate rejected later)",
        res.status === 409,
        `HTTP ${res.status} - ${res.data?.message || "-"}`
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
