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

const profileUpload = multer({ storage: profileStorage });
const postUpload = multer({ storage: postStorage });

module.exports = { profileUpload, postUpload };
