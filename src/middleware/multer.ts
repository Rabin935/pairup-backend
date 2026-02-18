import fs from "fs";
import multer from "multer";
import path from "path";

const uploadsDir = path.resolve(__dirname, "../../uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
};

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error("Unsupported file type. Please upload a valid image."));
};

export const upload = multer({ storage, limits, fileFilter });
