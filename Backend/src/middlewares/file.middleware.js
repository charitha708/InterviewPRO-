const multer = require("multer")


const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 3 * 1024 * 1024 // 3MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true)
        } else {
            cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname, "PDF files only"))
        }
    }
})


/**
 * @description Turns multer upload errors into friendly JSON responses
 * instead of the generic 500 from the global error handler.
 */
function handleUploadError(err, req, res, next) {
    if (!err) {
        return next()
    }

    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
            message: "Resume file is too large. Maximum size is 3MB."
        })
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
            message: "Only PDF resume files are supported. Please export your resume as a PDF."
        })
    }

    return next(err)
}


module.exports = upload
module.exports.handleUploadError = handleUploadError
