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
    console.log(file)
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


const profileUpload = multer({ storage: profileStorage });
const postUpload = multer({ storage: postStorage });
const pollUpload = multer({ storage: pollStorage });
const storyUpload = multer({ storage: storyStorage });

module.exports = { profileUpload, postUpload,pollUpload,storyUpload };
