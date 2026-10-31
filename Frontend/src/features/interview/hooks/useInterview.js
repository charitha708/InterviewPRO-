import { getAllInterviewReports, generateInterviewReport, getInterviewReportById, generateResumePdf } from "../services/interview.api"
import { getErrorMessage } from "../../../utils/api-error"
import { useContext, useEffect } from "react"
import { InterviewContext } from "../interview.context"
import { useParams } from "react-router"


export const useInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId } = useParams()

    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider")
    }

    const { loading, setLoading, report, setReport, reports, setReports } = context

    /**
     * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
     */
    const generateReport = async ({ jobDescription, selfDescription, resumeFile }) => {
        setLoading(true)
        try {
            const response = await generateInterviewReport({ jobDescription, selfDescription, resumeFile })
            setReport(response.interviewReport)
            return { success: true, data: response.interviewReport }
        } catch (error) {
            return { success: false, error: getErrorMessage(error) }
        } finally {
            setLoading(false)
        }
    }

    /**
     * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
     */
    const getReportById = async (id) => {
        setLoading(true)
        try {
            const response = await getInterviewReportById(id)
            setReport(response.interviewReport)
            return { success: true, data: response.interviewReport }
        } catch (error) {
            setReport(null)
            return { success: false, error: getErrorMessage(error) }
        } finally {
            setLoading(false)
        }
    }

    /**
     * @returns {Promise<{ success: boolean, data?: array, error?: string }>}
     */
    const getReports = async () => {
        setLoading(true)
        try {
            const response = await getAllInterviewReports()
            setReports(response.interviewReports)
            return { success: true, data: response.interviewReports }
        } catch (error) {
            return { success: false, error: getErrorMessage(error) }
        } finally {
            setLoading(false)
        }
    }

    /**
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    const getResumePdf = async (interviewReportId) => {
        setLoading(true)
        try {
            const response = await generateResumePdf({ interviewReportId })
            const url = window.URL.createObjectURL(new Blob([ response ], { type: "application/pdf" }))
            const link = document.createElement("a")
            link.href = url
            link.setAttribute("download", `resume_${interviewReportId}.pdf`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
            return { success: true }
        } catch (error) {
            return { success: false, error: getErrorMessage(error) }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        } else {
            getReports()
        }
    }, [ interviewId ])

    return { loading, report, reports, generateReport, getReportById, getReports, getResumePdf }

}
