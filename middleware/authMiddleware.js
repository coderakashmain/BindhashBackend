const jwt = require("jsonwebtoken");
require("dotenv").config();


const verifyToken = (req, res, next) =>  {
  const token = req.cookies.usertoken; 

  if (!token) {
    return res.status(401).json({ authenticated: false, message: "No token found" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded user ID to request


    next();
  } catch (err) {
    res.status(401).json({ authenticated: false, message: "Invalid token" });
  }
};
const newuserverify = (req, res, next) =>  {
  const token = req.cookies.newusertoken; 

  if (!token) {
    return res.status(401).json({ authenticated: false, message: "No token found" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded user ID to request


    next();
  } catch (err) {
    res.status(401).json({ authenticated: false, message: "Invalid token" });
  }
};

module.exports = {verifyToken, newuserverify}
