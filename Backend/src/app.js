const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

const app = express()

app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://interview-pro-rust-sigma.vercel.app"
    ],
    credentials: true
}))

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")


/* using all the routes here */
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)


/* 404 for unknown routes - JSON instead of an HTML error page */
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" })
})

/* Global error handler - keep the response JSON so the frontend can read
   err.response.data.message; never leak stack traces to the client. */
app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ message: "Something went wrong. Please try again." })
})

module.exports = app