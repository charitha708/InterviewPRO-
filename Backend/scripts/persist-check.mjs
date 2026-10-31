/* Persistence check: register a fixed account, then log in with that same
   account after the server has been restarted. Run: node scripts/persist-check.mjs */
const BASE = "http://localhost:3000"

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
    await sleep(4000) // give the server a moment to boot

    // 1. Create a fixed test account (first run).
    let res = await fetch(BASE + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "persist_check",
            email: "persist_check@example.com",
            password: "TestPass123"
        })
    })
    console.log("register(1st run):", res.status)
    if (res.status === 201) {
        console.log("  -> PASS: user saved in MongoDB Atlas")
    } else if (res.status === 409) {
        console.log("  -> INFO: user already existed from an earlier run")
    } else {
        console.log("  -> FAIL:", JSON.stringify(await res.json()))
        process.exit(1)
    }

    // 2. Login using the SAME account after the server was restarted.
    res = await fetch(BASE + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "persist_check@example.com", password: "TestPass123" })
    })
    console.log("login after restart:", res.status)
    if (res.status === 200) {
        console.log("  -> PASS: same account logs in again (record persisted across restart)")
    } else {
        console.log("  -> FAIL:", JSON.stringify(await res.json()))
        process.exit(1)
    }

    // 3. The new session must be usable.
    const c = (res.headers.getSetCookie() || []).find(x => x.startsWith("token="))
    res = await fetch(BASE + "/api/auth/get-me", { headers: { Cookie: c ? c.split(";")[ 0 ] : "" } })
    console.log("get-me:", res.status, res.status === 200 ? "-> PASS: session issued" : "-> FAIL")
    process.exit(res.status === 200 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
