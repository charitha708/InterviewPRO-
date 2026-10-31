import { useContext, useEffect } from "react";
import { AuthContext } from "../auth.context";
import { login, register, logout, getMe, getErrorMessage } from "../services/auth.api";



export const useAuth = () => {

    const context = useContext(AuthContext)

    if (!context) {
        throw new Error("useAuth must be used inside an <AuthProvider>")
    }

    const { user, setUser, loading, setLoading } = context


    /**
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    const handleLogin = async ({ email, password }) => {
        setLoading(true)
        try {
            const data = await login({ email, password })
            setUser(data.user)
            return { success: true }
        } catch (err) {
            return { success: false, error: getErrorMessage(err) }
        } finally {
            setLoading(false)
        }
    }

    /**
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    const handleRegister = async ({ username, email, password }) => {
        setLoading(true)
        try {
            const data = await register({ username, email, password })
            setUser(data.user)
            return { success: true }
        } catch (err) {
            return { success: false, error: getErrorMessage(err) }
        } finally {
            setLoading(false)
        }
    }

    /**
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    const handleLogout = async () => {
        setLoading(true)
        try {
            const data = await logout()
            setUser(null)
            return { success: true }
        } catch (err) {
            return { success: false, error: getErrorMessage(err) }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {

        const getAndSetUser = async () => {
            try {

                const data = await getMe()
                setUser(data.user)
            } catch (err) { } finally {
                setLoading(false)
            }
        }

        getAndSetUser()

    }, [])

    return { user, loading, handleRegister, handleLogin, handleLogout }
}
