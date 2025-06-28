const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinaryConfig");

// console.log("Cloudinary Instance:", cloudinary);

// 🔹 Cloudinary Storage for Profile Pictures
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profile_pictures",
    allowed_formats: ["jpg", "jpeg", "png"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
    transformation: [
      { width: 800, height: 800, crop: "limit" }, 
      { quality: "auto:good" }, 
    ],
  },
});

// 🔹 Cloudinary Storage for Post Images
const postStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
 

    const isVideo = file.mimetype.startsWith("video/");
    return {
      folder: "post_media",
      resource_type: isVideo ? "video" : "image",
      format: isVideo ? "mp4" : "jpg",
      allowed_formats: ["jpg", "jpeg", "png", "mp4"],
      transformation: isVideo
        ? [{ quality: "auto", fetch_format: "auto" }] // Optimize video size
        : [{ width: 800, height: 800, crop: "limit" }, { quality: "auto:good" }],
    };
  },
 
});

const storyStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "story_content",
    allowed_formats: ["jpg", "jpeg", "png", "mp4"],
    resource_type: "auto", 
    transformation: [
      { width: 800, height: 800, crop: "limit" }, 
      { quality: "auto:good" }, 
    ],
  },
});

const pollStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: "poll_images",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [
      { width: 800, height: 800, crop: "limit" }, 
      { quality: "auto:good" }, 
    ],
    public_id: `poll_option_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  }),
});

const deleteFromCloudinary = async (publicId,resourceType) => {
  console.log(publicId ,"and ", resourceType)

    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.error("Cloudinary delete error:", error);
    }
};


const getCloudinaryPublicId = (url, folder = "post_media") => {
  try {
    const parts = url.split("/");
    const filename = parts.pop(); // e.g., abc123.jpg or xyz456.mp4
    const [publicId, extension] = filename.split(".");

    const resourceType = ["mp4", "webm", "mov"].includes(extension.toLowerCase())
      ? "video"
      : "image";

    return {
      publicId: `${folder}/${publicId}`,
      resourceType,
    };
  } catch (error) {
    console.error("Error extracting publicId and resourceType:", error);
    return null;
  }
};



const profileUpload = multer({ storage: profileStorage });
const postUpload = multer({ storage: postStorage });
const pollUpload = multer({ storage: pollStorage });
const storyUpload = multer({ storage: storyStorage });

module.exports = { profileUpload, postUpload,pollUpload,storyUpload,deleteFromCloudinary ,getCloudinaryPublicId};
