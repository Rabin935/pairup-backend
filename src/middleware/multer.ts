import multer from "multer";

const storage = multer.memoryStorage();

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
};

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/gif",
  ];
  const mimetype = (file.mimetype || "").toLowerCase();
  if (allowed.includes(mimetype)) {
    return cb(null, true);
  }
  cb(new Error("Unsupported file type. Please upload a valid image."));
};

export const upload = multer({ storage, limits, fileFilter });
