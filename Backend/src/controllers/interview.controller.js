const pdfParse = require("pdf-parse")
const { generateInterviewReport, generateResumePdf } = require("../services/ai.service")
const interviewReportModel = require("../models/interviewReport.model")




/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */

async function generateInterViewReportController(req, res) {
    try {
        // 1. Check whether a resume was uploaded
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                message: "Resume file is missing. Please upload a PDF or DOCX file."
            });
        }

        const { selfDescription, jobDescription } = req.body;

        // 2. Validate required input
        if (!jobDescription || !jobDescription.trim()) {
            return res.status(400).json({
                message: "Please enter the target job description."
            });
        }

        // 3. Extract text from the uploaded PDF
        let resumeContent;

        try {
            const parser = new pdfParse.PDFParse({
                data: new Uint8Array(req.file.buffer)
            });

            resumeContent = await parser.getText();
            await parser.destroy();
        } catch (error) {
            console.error("PDF parsing failed:", error);

            return res.status(400).json({
                message: "Unable to read this PDF. Please export your resume as a new PDF and upload it again."
            });
        }

        if (!resumeContent.text || !resumeContent.text.trim()) {
            return res.status(400).json({
                message: "No readable text found in the PDF. Please upload a text-based PDF."
            });
        }

        // 4. Generate the interview report using AI
        const interViewReportByAi = await generateInterviewReport({
            resume: resumeContent.text,
            selfDescription,
            jobDescription
        });

        // 5. Save the generated report
        const interviewReport = await interviewReportModel.create({
            user: req.user.id,
            resume: resumeContent.text,
            selfDescription,
            jobDescription,
            ...interViewReportByAi
        });

        return res.status(201).json({
            message: "Interview report generated successfully.",
            interviewReport
        });

    } catch (error) {
        console.error("Interview report generation failed:", error);

        return res.status(500).json({
            message: "Failed to generate the interview report. Check the backend terminal for details."
        });
    }
}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res) {

    const { interviewId } = req.params

    const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id })

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    res.status(200).json({
        message: "Interview report fetched successfully.",
        interviewReport
    })
}


/** 
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res) {
    const interviewReports = await interviewReportModel.find({ user: req.user.id }).sort({ createdAt: -1 }).select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan")

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })
}


/**
 * @description Controller to generate resume PDF based on user self description, resume and job description.
 */
async function generateResumePdfController(req, res) {
    const { interviewReportId } = req.params

    const interviewReport = await interviewReportModel.findById(interviewReportId)

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    const { resume, jobDescription, selfDescription } = interviewReport

    const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription })

    res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`
    })

    res.send(pdfBuffer)
}

module.exports = { generateInterViewReportController, getInterviewReportByIdController, getAllInterviewReportsController, generateResumePdfController }