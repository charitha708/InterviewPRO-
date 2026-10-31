/**
 * @description Convert an axios error into a single readable message the UI
 * can display. Forwards the backend's message whenever there is one.
 */
export function getErrorMessage(err) {
    if (err.response?.data?.message) {
        return err.response.data.message
    }

    if (err.code === "ERR_NETWORK") {
        return "Cannot reach the server. Please make sure the backend is running."
    }

    return "Something went wrong. Please try again."
}
