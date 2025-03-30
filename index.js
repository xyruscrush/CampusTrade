const express = require("express");
require("dotenv").config();
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const app = express();
const port = 8000;
const connectDB = require("./db.js");
const cloudinary = require("./cloudinary.js");
const upload = require("./multer.js");
const streamifier = require("streamifier");
const { v4: uuidv4 } = require("uuid");
const { ObjectId } = require('mongodb');
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
connectDB();


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "https://campustradefrontend.vercel.app",
    credentials: true,
  })
);
app.get("/", (req, res) => {
  res.send("Hello World");
});

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const itemsSchema = new mongoose.Schema({
  user: { type: String, required: true },
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  price_per_day: { type: String, required: true },
  category: { type: String, required: true },
  mobile_number: { type: String, required: true },
  Image_url: { type: String, required: true, unique: true },
  Image_id: { type: String, required: true, unique: true },
});

const Items = mongoose.models.Items || mongoose.model("Items", itemsSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);

app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email and password are required" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    return res
      .status(201)
      .json({ success: true, message: "Signup successful" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

   const accessToken = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
    expiresIn: "15m"});
    const refreshToken = jwt.sign(
      { id: user._id, email: user.email },
      JWT_REFRESH_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      
    });
    
     res.json({
      success: true,
      message: "Login successful",
      accessToken,
    });
   
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/refresh", (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: "Unauthorized" });
  console.log("yes_token_there");
  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
     console.log("yes_token_there");
     const accessToken = jwt.sign({ email: decoded.email,id:decoded.id }, JWT_SECRET, {
       expiresIn: "15m",
     });
     console.log(accessToken);
    res.json({ accessToken: accessToken });
  });
});


app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "uploads" },
      async (error, result) => {
        if (error) return res.status(500).json({ error: error.message });

        const unique_id = uuidv4();
        const newItems = new Items({
          user: req.body.user,
          id: unique_id,
          name: req.body.name,
          category: req.body.category,
          description: req.body.description,
          price_per_day: req.body.price_per_day,
          mobile_number: req.body.mobile_number,
          Image_url: result.secure_url,
          Image_id: result.public_id,
        });

        await newItems.save();
        res.json({ message: "Uploaded successfully!", item: newItems });
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/get_items_secure", async (req, res) => {
  let authHeader = req.headers["authorization"];
  const token =authHeader.split(" ")[1];
 
  console.log("entered");
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    
    if (err) return res.status(403).json({ message: "Forbidden" });

    try {
      const data = await Items.find().lean(); 
      console.log(data);
      res.json({ message: "Welcome to Dashboard", data, user });
    } catch (error) {
      res.status(500).json({ message: "Error fetching items", error });
    }
  });
});

app.post("/check-refresh-token", (req, res) => {
  if (req.cookies.refreshToken) {
    res.json({ exists: true, message: "Refresh token is present" });
  } else {
    res.json({ exists: false, message: "No refresh token found" });
  }
});

app.post("/logout", (req, res) => {
  res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "None" });
  return res.status(200).json({ message: "Logout successful" });
});
app.delete("/delete", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).send("ID is required");
    }
    console.log(id);
   console.log("hello");
    
    
    const result = await Items.deleteOne({ _id: id });
     
    if (result.deletedCount === 1) {
      res.status(200).send("Document deleted successfully");
    } else {
      res.status(404).send("Document not found");
    }
  } catch (err) {
    res.status(500).send("Error deleting document");
  } 
});
app.post("/item/:id", async (req, res) => {
  console.log("hello");

  const { id } = req.params;

  try {
    const response = await Items.findOne({ _id: id }).lean();

    if (response) {
      
       res.json({ response, message: true });
       console.log(response);
    } else {
      res.json({ message: false });
    }
  } catch (error) {
    console.error("Error fetching item:", error);
     res.status(500).json({ message: "Internal Server Error" });
  }
});
const authenticate = async (req, res, next) => {
  console.log(req.headers.authorization);
  const token = req.headers.authorization?.split(" ")[1];
  console.log("hello");
  console.log(token);
  if (!token)
    return res.status(401).json({ success: false, message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ success: false, message: "Invalid token" });
  }
};

app.post("/update-email", authenticate, async (req, res) => {
  const { email } = req.body;
  console.log(email);
  if (!email)
    return res.status(400).json({ success: false, message: "Email required",email:email });
  try {
    await User.findByIdAndUpdate(req.user.id, { email });
    res.json({ success: true, message: "Email updated successfully",email:email });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/update-password", authenticate, async (req, res) => {
  const { password } = req.body;
  if (!password)
    return res
      .status(400)
      .json({ success: false, message: "Password required" });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(req.user.id, { password: hashedPassword });
    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
