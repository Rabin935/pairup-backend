import { UploadApiErrorResponse, UploadApiResponse } from "cloudinary";
import { cloudinary } from "../config/cloudinary";
import { CLOUDINARY_FOLDER } from "../config";

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

export class CloudinaryService {
  static async uploadImage(
    file: Express.Multer.File,
    folder: string = CLOUDINARY_FOLDER
  ): Promise<CloudinaryUploadResult> {
    if (!file?.buffer) {
      throw new Error("Image file is missing or invalid");
    }

    const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder },
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error || !result) {
            return reject(error || new Error("Unable to upload image"));
          }
          return resolve(result);
        }
      );

      uploadStream.end(file.buffer);
    });

    return {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    };
  }

  static async deleteImage(publicId?: string): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      // Do not block the request if cleanup fails.
      console.warn(`Failed to delete Cloudinary asset ${publicId}:`, (error as Error).message);
    }
  }
}
