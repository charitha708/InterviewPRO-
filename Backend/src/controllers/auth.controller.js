const userModel = require("../models/user.model")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")


/*
    Cookie security:
    - httpOnly  -> the token cookie can never be read by browser JS (XSS protection)
    - sameSite  -> in production the frontend and backend live on different sites
                   (Vercel + Render), so "none" is required to carry credentials
                   across; in local dev both apps are on localhost, so "lax" is enough.
    - secure    -> required by browsers whenever sameSite is "none" (https only).
*/
const COOKIE_OPTIONS = () => {
    const isProduction = process.env.NODE_ENV === "production"

    return {
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
        maxAge: 24 * 60 * 60 * 1000 // 1 day, matches the JWT expiry
    }
}


/**
 * @name registerUserController
 * @description register a new user, expects username, email and password in the request body
 * @access Public
 */
async function registerUserController(req, res) {

    const { username, email, password } = req.body

    if (!username || !email || !password) {
        return res.status(400).json({
            message: "Please provide username, email and password"
        })
    }

    // The model stores emails lowercased, so compare in lowercase too.
    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedUsername = String(username).trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
            message: "Please provide a valid email address"
        })
    }

    if (String(password).length < 6) {
        return res.status(400).json({
            message: "Password must be at least 6 characters long"
        })
    }

    // Look up each conflict separately so the user gets an actionable message.
    const emailTaken = await userModel.findOne({ email: normalizedEmail })
    if (emailTaken) {
        return res.status(409).json({
            message: "Account already exists with this email address"
        })
    }

    const usernameTaken = await userModel.findOne({ username: normalizedUsername })
    if (usernameTaken) {
        return res.status(409).json({
            message: "Username is already taken"
        })
    }

    const hash = await bcrypt.hash(password, 10)

    try {
        const user = await userModel.create({
            username: normalizedUsername,
            email: normalizedEmail,
            password: hash
        })

        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        )

        res.cookie("token", token, COOKIE_OPTIONS())

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        // Safety net for the duplicate race condition: two requests passing the
        // findOne checks at the same time; Mongo's unique index catches it here.
        if (err && err.code === 11000) {
            return res.status(409).json({
                message: "Account already exists with this email address or username"
            })
        }
        throw err
    }

}


/**
 * @name loginUserController
 * @description login a user, expects email and password in the request body
 * @access Public
 */
async function loginUserController(req, res) {

    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({
            message: "Please provide email and password"
        })
    }

    const user = await userModel.findOne({
        email: String(email).trim().toLowerCase()
    })

    if (!user) {
        return res.status(401).json({
            message: "Invalid email or password"
        })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
        return res.status(401).json({
            message: "Invalid email or password"
        })
    }

    const token = jwt.sign(
        { id: user._id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    )

    // Always overwrite any previous session cookie so two accounts can never
    // end up sharing one browser session.
    res.cookie("token", token, COOKIE_OPTIONS())

    res.status(200).json({
        message: "User loggedIn successfully.",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    })
}


/**
 * @name logoutUserController
 * @description clear token from user cookie and add the token in blacklist
 * @access public
 */
async function logoutUserController(req, res) {
    const token = req.cookies.token

    if (token) {
        await tokenBlacklistModel.create({ token })
    }

    res.clearCookie("token", COOKIE_OPTIONS())

    res.status(200).json({
        message: "User logged out successfully"
    })
}

/**
 * @name getMeController
 * @description get the current logged in user details.
 * @access private
 */
async function getMeController(req, res) {

    const user = await userModel.findById(req.user.id)

    // Guard: a valid token may still reference a user that no longer exists
    // (deleted after the token was issued).
    if (!user) {
        return res.status(401).json({
            message: "User not found"
        })
    }

    res.status(200).json({
        message: "User details fetched successfully",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    })

}



module.exports = {
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController
}
