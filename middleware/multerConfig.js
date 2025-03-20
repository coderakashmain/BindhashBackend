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
  params: {
    folder: "post_images",
    allowed_formats: ["jpg", "jpeg", "png", "mp4"],
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

module.exports = { profileUpload, postUpload,pollUpload };
