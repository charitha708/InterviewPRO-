import axios from "axios"
import { getErrorMessage } from "../../../utils/api-error"


/*
    The API base URL comes from VITE_API_URL when it is defined (used by the
    deployed production build) and falls back to the local backend for
    development. No environment-specific URL is hardcoded here.
*/
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
    withCredentials: true
})


export async function register({ username, email, password }) {

    const response = await api.post('/api/auth/register', {
        username, email, password
    })

    return response.data
}


export async function login({ email, password }) {

    const response = await api.post("/api/auth/login", {
        email, password
    })

    return response.data
}


export async function logout() {

    const response = await api.get("/api/auth/logout")

    return response.data
}


export async function getMe() {

    const response = await api.get("/api/auth/get-me")

    return response.data
}


export { getErrorMessage }
